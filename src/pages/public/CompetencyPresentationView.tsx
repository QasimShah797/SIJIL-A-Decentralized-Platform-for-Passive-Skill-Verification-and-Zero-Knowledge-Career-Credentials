import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Copy, Info, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/sijil/PageHeader";
import { PublicSurfaceLayout } from "@/components/sijil/PublicSurfaceLayout";
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
    <PublicSurfaceLayout accent="strong" className="verify-surface">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <div className="mb-8 rounded-2xl border border-border/60 bg-card p-6 shadow-sm sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Credential verification</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            Verify credentials. Build trust instantly.
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            This page shows only what the learner chose to disclose — with signed proof metadata.
            Full wallet access is never granted from a presentation link.
          </p>
        </div>

        <div className="mb-6 flex items-start gap-3 rounded-xl border border-info/20 bg-info/5 px-4 py-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden />
          <div>
            <span className="font-medium text-foreground">Selective disclosure.</span>{" "}
            Recruiters receive verified claims via a time-limited link — not the learner&apos;s complete evidence package.
          </div>
        </div>

        <PageHeader
          title="Presentation viewer"
          description="Cryptographic verification of disclosed competency attributes."
          actions={(
            <div className="flex items-center gap-2">
              {!loading && presentation && (
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="rounded-xl"
                  aria-label="Copy presentation link"
                  onClick={() => {
                    void navigator.clipboard.writeText(window.location.href);
                    toast({ title: "Presentation link copied" });
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              )}
              <Button variant="outline" className="rounded-xl" onClick={() => navigate(-1)}>
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Back
              </Button>
            </div>
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
            <Card className="overflow-hidden border-primary/15 shadow-md">
              <div className="credential-foil px-5 py-4 text-primary-foreground sm:px-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-primary-foreground/70">
                      Verification result
                    </p>
                    <p className="mt-1 text-lg font-semibold">{presentation.verification.result}</p>
                  </div>
                  <StatusBadge variant={proofVariant(presentation.verification.result)} className="bg-white/15 text-primary-foreground">
                    {presentation.proofType}
                  </StatusBadge>
                </div>
              </div>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
                <div>
                  <div className="text-sm font-medium">Proof metadata</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Issued {formatDate(presentation.createdAt)} · Expires {formatDate(presentation.expiresAt)}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {presentation.verification.revoked && (
                    <StatusBadge variant="destructive">Revoked</StatusBadge>
                  )}
                  {!presentation.verification.revoked && presentation.verification.expired && (
                    <StatusBadge variant="warning">Expired</StatusBadge>
                  )}
                  <Button
                    className="rounded-xl"
                    onClick={() => void runVerification()}
                    disabled={verifying}
                  >
                    {presentation.verification.result === "Valid Proof" ? (
                      <ShieldCheck className="mr-1.5 h-4 w-4" />
                    ) : (
                      <ShieldAlert className="mr-1.5 h-4 w-4" />
                    )}
                    {verifying ? "Verifying…" : "Run verification"}
                  </Button>
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
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}
      </div>
    </PublicSurfaceLayout>
  );
}
