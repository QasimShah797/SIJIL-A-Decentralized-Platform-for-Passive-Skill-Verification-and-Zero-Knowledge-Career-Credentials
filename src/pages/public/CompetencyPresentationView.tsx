import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Copy, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/sijil/PageHeader";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { FieldRow } from "@/components/sijil/FieldRow";
import { toast } from "@/hooks/use-toast";
import {
  getPublicPresentationApi,
  verifyPublicPresentationApi,
  type PublicPresentationView,
} from "@/services/api/wallet.api";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function titleCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function proofVariant(result: PublicPresentationView["verification"]["result"]): "verified" | "warning" | "destructive" {
  if (result === "Valid Proof") return "verified";
  if (result === "Expired") return "warning";
  return "destructive";
}

function renderPrimitive(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function DisclosureValue({ value }: { value: unknown }) {
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    return (
      <div className="grid gap-3">
        {value.map((item, index) => (
          <div key={index} className="rounded-xl border border-border/60 p-3">
            {isRecord(item) ? (
              Object.entries(item).map(([key, nested]) => (
                <FieldRow key={key} label={titleCase(key)} value={renderPrimitive(nested)} />
              ))
            ) : (
              <div className="text-sm">{renderPrimitive(item)}</div>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (isRecord(value)) {
    const entries = Object.entries(value).filter(([, nested]) => {
      if (nested == null) return false;
      if (Array.isArray(nested)) return nested.length > 0;
      if (isRecord(nested)) return Object.keys(nested).length > 0;
      if (typeof nested === "string") return nested.trim().length > 0;
      return true;
    });
    if (entries.length === 0) return null;

    return (
      <div className="space-y-4">
        {entries.map(([key, nested]) => (
          <div key={key} className="space-y-3">
            {Array.isArray(nested) || isRecord(nested) ? (
              <>
                <div className="text-sm font-medium">{titleCase(key)}</div>
                <DisclosureValue value={nested} />
              </>
            ) : (
              <FieldRow label={titleCase(key)} value={renderPrimitive(nested)} />
            )}
          </div>
        ))}
      </div>
    );
  }

  return <div className="text-sm">{renderPrimitive(value)}</div>;
}

function DisclosureSection({
  title,
  value,
}: {
  title: string;
  value: unknown;
}) {
  if (value == null) return null;
  if (Array.isArray(value) && value.length === 0) return null;
  if (isRecord(value) && Object.keys(value).length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <DisclosureValue value={value} />
      </CardContent>
    </Card>
  );
}

export default function CompetencyPresentationView() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [presentation, setPresentation] = useState<PublicPresentationView | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError("Presentation token is missing.");
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    getPublicPresentationApi(token)
      .then((next) => {
        if (!active) return;
        setPresentation(next);
      })
      .catch((nextError: unknown) => {
        if (!active) return;
        setError(nextError instanceof Error ? nextError.message : "Could not load presentation.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [token]);

  const sections = useMemo(() => {
    if (!presentation) return [];
    return Object.entries(presentation.disclosedPayload)
      .filter(([, value]) => value != null)
      .map(([key, value]) => ({
        key,
        title: titleCase(key),
        value,
      }));
  }, [presentation]);

  const runVerification = async () => {
    if (!token) return;
    setVerifying(true);
    try {
      const next = await verifyPublicPresentationApi(token);
      setPresentation(next);
      toast({
        title: next.verification.result,
        description: next.verification.result === "Valid Proof"
          ? "The disclosed payload hash and signed presentation proof are valid."
          : "The presentation is expired, revoked, or tampered.",
        variant: next.verification.result === "Valid Proof" ? "default" : "destructive",
      });
    } catch (nextError) {
      toast({
        title: "Verification failed",
        description: nextError instanceof Error ? nextError.message : "Could not verify presentation.",
        variant: "destructive",
      });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-6 py-10 lg:px-8">
        <PageHeader
          title="Selective Disclosure Presentation"
          description="Recruiters only see the attributes the learner explicitly disclosed. This page verifies a signed selective disclosure presentation, not a full zero-knowledge proof."
          actions={(
            <Button variant="outline" onClick={() => navigate(-1)}>
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back
            </Button>
          )}
        />

        {loading ? (
          <div className="text-sm text-muted-foreground">Loading presentation…</div>
        ) : error || !presentation ? (
          <Card>
            <CardContent className="p-6 text-sm text-destructive">
              {error ?? "Could not load the disclosed presentation."}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <Card>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
                <div>
                  <div className="text-sm font-medium">Proof result</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Issued {formatDate(presentation.createdAt)} · Expires {formatDate(presentation.expiresAt)}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge variant={proofVariant(presentation.verification.result)}>
                    {presentation.verification.result}
                  </StatusBadge>
                  <StatusBadge variant="info">
                    {presentation.proofType}
                  </StatusBadge>
                  {presentation.verification.revoked && (
                    <StatusBadge variant="destructive">Revoked</StatusBadge>
                  )}
                  {!presentation.verification.revoked && presentation.verification.expired && (
                    <StatusBadge variant="warning">Expired</StatusBadge>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-6">
                {sections.map((section) => (
                  <DisclosureSection key={section.key} title={section.title} value={section.value} />
                ))}
              </div>

              <div className="space-y-6">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Verification Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <FieldRow
                      label="Token"
                      value={presentation.verification.tokenValid ? "Valid" : "Invalid"}
                    />
                    <FieldRow
                      label="Payload hash"
                      value={presentation.verification.payloadHashMatches ? "Matches" : "Mismatch"}
                    />
                    <FieldRow
                      label="Signed proof"
                      value={presentation.verification.proofValid ? "Valid" : "Invalid"}
                    />
                    <FieldRow
                      label="Record integrity"
                      value={presentation.verification.recordUnmodified ? "Unmodified" : "Tampered"}
                    />
                    <FieldRow
                      label="Verification method"
                      value={presentation.verificationMethod ?? "Not disclosed"}
                      mono
                    />
                    <div className="pt-3">
                      <Button onClick={() => void runVerification()} disabled={verifying}>
                        {presentation.verification.result === "Valid Proof" ? (
                          <ShieldCheck className="mr-1.5 h-4 w-4" />
                        ) : (
                          <ShieldAlert className="mr-1.5 h-4 w-4" />
                        )}
                        Run Verification
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Presentation Metadata</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <FieldRow label="Created" value={formatDate(presentation.createdAt)} />
                    <FieldRow label="Expires" value={formatDate(presentation.expiresAt)} />
                    <FieldRow label="Revoked at" value={formatDate(presentation.revokedAt)} />
                    <FieldRow label="Payload hash" value={presentation.payloadHash} mono />
                    <FieldRow label="Proof value" value={presentation.proofValue ?? "Not available"} mono />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Privacy Notice</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-muted-foreground">
                    <p>Only the disclosed payload shown on this page was shared.</p>
                    <p>The learner's full wallet is not accessible from this presentation link.</p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          void navigator.clipboard.writeText(window.location.href);
                          toast({ title: "Presentation link copied" });
                        }}
                      >
                        <Copy className="mr-1.5 h-4 w-4" />
                        Copy Link
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
