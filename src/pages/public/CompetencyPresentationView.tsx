import { ZKP_UI_ENABLED } from "@/lib/zkp-ui";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Copy, Info, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/sijil/EmptyState";
import { PageHeader } from "@/components/sijil/PageHeader";
import { PageSkeleton } from "@/components/sijil/SkeletonLoader";
import { PublicSurfaceLayout } from "@/components/sijil/PublicSurfaceLayout";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { FieldRow } from "@/components/sijil/FieldRow";
import { toast } from "@/hooks/use-toast";
import {
  isLedgerVerifyStatus,
  mapLedgerStatusToBadge,
  shareShowsVerified,
  type LedgerVerifyStatus,
} from "@/lib/ledger-status";
import { getPublicCredentialApi } from "@/services/api/public-credential.api";
import { recruiterVerificationLines } from "@/lib/sharing/guide";
import {
  getPublicPresentationApi,
  verifyPublicPresentationApi,
  type PublicPresentationView,
} from "@/services/api/wallet.api";
import { SharedPrivateVerificationPanel } from "@/components/recruiter/SharedPrivateVerificationPanel";

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

function proofVariant(
  result: PublicPresentationView["verification"]["result"],
  ledgerStatus: string | null | undefined,
  detail?: string | null,
): "verified" | "warning" | "destructive" {
  if (shareShowsVerified({ ledgerStatus, detail }) && result === "Valid Proof") return "verified";
  if (
    result === "Expired"
    || ledgerStatus === "ledger_unavailable"
    || ledgerStatus === "pending_anchor"
    || ledgerStatus === "evidence_unavailable"
    || detail === "legacy_unverified_evidence"
  ) {
    return "warning";
  }
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
  const [ledgerStatus, setLedgerStatus] = useState<LedgerVerifyStatus | null>(null);
  const [ledgerDetail, setLedgerDetail] = useState<string | null>(null);

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

    getPublicCredentialApi(token)
      .then((credential) => {
        if (!active) return;
        setLedgerStatus(
          isLedgerVerifyStatus(credential.ledgerStatus) ? credential.ledgerStatus : "ledger_unavailable",
        );
        setLedgerDetail(credential.ledgerDetail ?? null);
      })
      .catch(() => {
        if (!active) return;
        setLedgerStatus("ledger_unavailable");
      });

    return () => {
      active = false;
    };
  }, [token]);

  const sections = useMemo(() => {
    if (!presentation) return [];
    const hideKeys = new Set([
      "privateResults",
      "zkProofs",
      "evidenceModes",
      "selectiveDisclosure",
      "audience",
      "shareKind",
      "recipientUserId",
      "consentedAt",
    ]);
    return Object.entries(presentation.disclosedPayload)
      .filter(([key, value]) => value != null && !hideKeys.has(key))
      .map(([key, value]) => ({
        key,
        title: titleCase(key),
        value,
      }));
  }, [presentation]);

  const ledgerBadge = mapLedgerStatusToBadge(ledgerStatus, ledgerDetail);
  const access = presentation?.verification.revoked
    ? "revoked"
    : presentation?.verification.expired
      ? "expired"
      : "active";
  const checks = recruiterVerificationLines({
    access,
    ledgerStatus,
  });

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
            This page shows the items the learner included in this link, together with the server proof for that payload.
            A valid link proof is not the same as a current credential or a blockchain confirmation.
          </p>
        </div>

        <div className="mb-6 flex items-start gap-3 rounded-xl border border-info/20 bg-info/5 px-4 py-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden />
          <div>
            <span className="font-medium text-foreground">Shared fields.</span>{" "}
            This page shows the items stored for this link. It is not a zero-knowledge proof. Signature, credential status, and blockchain confirmation stay separate.
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
          <PageSkeleton rows={4} />
        ) : error || !presentation ? (
          <EmptyState
            icon={ShieldAlert}
            title="Presentation not found"
            description={error ?? "Could not load the disclosed presentation."}
          />
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
                    <ul className="mt-2 space-y-1 text-sm text-primary-foreground/90">
                      {checks.map((line) => (
                        <li key={line.label}>{line.label}: {line.value}</li>
                      ))}
                    </ul>
                  </div>
                  <StatusBadge variant={proofVariant(presentation.verification.result, ledgerStatus, ledgerDetail)} className="bg-white/15 text-primary-foreground">
                    {presentation.proofType}
                  </StatusBadge>
                  {ledgerStatus ? (
                    <StatusBadge variant={ledgerBadge.variant}>
                      {ledgerBadge.label}
                    </StatusBadge>
                  ) : null}
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
                {access === "active" ? sections.map((section) => (
                  <DisclosureSection key={section.key} title={section.title} value={section.value} />
                )) : (
                  <Card>
                    <CardContent className="p-5 text-sm text-muted-foreground">
                      {access === "revoked"
                        ? "This link was stopped. The shared items are not shown. Stopping a link does not delete a copy someone already saved, and it does not revoke the achievement."
                        : "This link has expired. The shared items are not shown."}
                    </CardContent>
                  </Card>
                )}
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

                {ZKP_UI_ENABLED && <>
                <p className="text-sm text-muted-foreground">
                  The badge above is the credential record. Private ZKP results below are accepted only after SIJIL verifies learner-shared proofs.
                </p>
                <SharedPrivateVerificationPanel
                  payload={presentation.disclosedPayload ?? {}}
                  competencyName={(() => {
                    const competency = presentation.disclosedPayload?.competency;
                    if (isRecord(competency) && typeof competency.name === "string" && competency.name.trim()) {
                      return competency.name.trim();
                    }
                    return "Shared credential";
                  })()}
                  selectedFields={presentation.selectedFields ?? []}
                  createdAt={presentation.createdAt}
                  expiresAt={presentation.expiresAt}
                  proofType={presentation.proofType ?? presentation.verificationMethod}
                />
                </>}

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
