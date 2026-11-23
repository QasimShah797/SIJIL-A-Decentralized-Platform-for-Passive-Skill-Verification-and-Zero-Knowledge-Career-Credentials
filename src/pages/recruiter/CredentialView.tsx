import { ZKP_UI_ENABLED } from "@/lib/zkp-ui";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { RecruiterWorkspaceShell } from "@/components/sijil/RecruiterWorkspaceShell";
import { PageHeader } from "@/components/sijil/PageHeader";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { FieldRow } from "@/components/sijil/FieldRow";
import { EmptyState } from "@/components/sijil/EmptyState";
import { PageSkeleton } from "@/components/sijil/SkeletonLoader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, ShieldCheck, ShieldAlert, EyeOff,
} from "lucide-react";
import { fetchPresentation } from "@/lib/db/presentations";
import { mapLedgerStatusToBadge, shareShowsVerified } from "@/lib/ledger-status";
import { recruiterVerificationLines, shareAccess } from "@/lib/sharing/guide";
import { verifyCredentialLedgerApi, type LedgerVerifyResult } from "@/services/api/ledger.api";
import type { SharedPresentation } from "@/lib/sijil-data";
import { toast } from "@/hooks/use-toast";

export default function RecruiterCredentialView() {
  const { token } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const [presentation, setPresentation] = useState<SharedPresentation | null>(null);
  const [loading, setLoading] = useState(true);
  const [ledgerResult, setLedgerResult] = useState<LedgerVerifyResult | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    setLoading(true);
    fetchPresentation(decodeURIComponent(token))
      .then((p) => setPresentation(p))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return <RecruiterWorkspaceShell><PageSkeleton rows={4} /></RecruiterWorkspaceShell>;
  }

  if (!presentation) {
    return (
      <RecruiterWorkspaceShell>
        <EmptyState
          icon={ShieldAlert}
          title="Presentation not found"
          description="The shared link is invalid, expired or has been revoked."
          action={{ label: "Back", onClick: () => navigate(-1) }}
        />
      </RecruiterWorkspaceShell>
    );
  }


  const access = shareAccess({
    revoked: presentation.revoked,
    expiresAt: presentation.expiresAt,
  });
  const open = access === "active";
  const ledgerBadge = !ledgerResult
    ? null
    : ledgerResult.checks?.zkp === "not_checked"
      ? { variant: "warning" as const, label: ZKP_UI_ENABLED ? "record matches, privacy proof not checked" : "Verification incomplete" }
      : ledgerResult.checks?.zkp === "invalid"
        ? { variant: "destructive" as const, label: ZKP_UI_ENABLED ? "privacy proof failed" : "Verification failed" }
        : mapLedgerStatusToBadge(ledgerResult.status, ledgerResult.detail);
  const checks = recruiterVerificationLines({
    access,
    ledgerStatus: ledgerResult?.status ?? null,
    checks: ledgerResult?.checks ?? null,
  }).filter((check) => ZKP_UI_ENABLED || check.label !== "Privacy proof");

  const runIntegrityCheck = async () => {
    setVerifying(true);
    try {
      const next = await verifyCredentialLedgerApi(presentation.credentialId);
      setLedgerResult(next);
      const zkp = next.checks?.zkp;
      const badge = zkp === "not_checked"
        ? { variant: "warning" as const, label: ZKP_UI_ENABLED ? "record matches, privacy proof not checked" : "Verification incomplete" }
        : zkp === "invalid"
          ? { variant: "destructive" as const, label: ZKP_UI_ENABLED ? "privacy proof failed" : "Verification failed" }
          : mapLedgerStatusToBadge(next.status, next.detail);
      const shown = shareShowsVerified({
        ledgerStatus: next.status,
        detail: next.detail,
        reason: next.reason,
        zkp,
      });
      toast({
        title: badge.label,
        description: shown
          ? "The blockchain record matches this credential."
          : badge.label,
        variant: shown || zkp === "not_checked" ? "default" : "destructive",
      });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <RecruiterWorkspaceShell>
      <PageHeader
        title="Verifiable Presentation"
        description="This page lists the fields stored for this share. A stopped or expired link does not show those fields. This is not a zero-knowledge proof."
        actions={
          <Button variant="outline" onClick={() => navigate(params.get("from") || "/recruiter/search")}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />Back
          </Button>
        }
      />

      <Card className="mb-6">
        <CardContent className="p-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-md bg-primary/10 text-primary flex items-center justify-center">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-medium">Presentation token</div>
              <div className="text-xs text-muted-foreground mono">{presentation.token}</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <StatusBadge variant={open ? "info" : "destructive"}>{access}</StatusBadge>
            {ledgerBadge ? (
              <StatusBadge variant={ledgerBadge.variant}>{ledgerBadge.label}</StatusBadge>
            ) : null}
            <StatusBadge variant="neutral">Recipient: {presentation.recipient}</StatusBadge>
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Disclosed claims */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Disclosed claims</CardTitle>
              <p className="text-xs text-muted-foreground">Only fields the learner chose to reveal are shown.</p>
            </CardHeader>
            <CardContent>
              {open ? presentation.disclosedFields.filter((field) => !isInstitutionClaim(field.id) && !isInstitutionClaim(field.label)).map((f) => (
                <FieldRow key={f.id} label={f.label} value={f.value} />
              )) : (
                <p className="text-sm text-muted-foreground">
                  {checks.map((line) => line.value).join(" ")}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Verification</CardTitle>
            </CardHeader>
            <CardContent>
              {checks.map((line) => (
                <FieldRow key={line.label} label={line.label} value={line.value} />
              ))}
              <div className="pt-3">
                <Button onClick={() => void runIntegrityCheck()} disabled={verifying || !open}>
                  <ShieldCheck className="h-4 w-4 mr-1.5" /> {verifying ? "Verifying…" : "Check blockchain record"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Not included</CardTitle></CardHeader>
            <CardContent>
              {presentation.hiddenFields.length === 0 ? (
                <div className="text-xs text-muted-foreground">No extra field labels were stored for this share.</div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {presentation.hiddenFields.filter((field) => !isInstitutionClaim(field)).map((h) => (
                    <StatusBadge key={h} variant="neutral"><EyeOff className="h-3 w-3" /> {h}</StatusBadge>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-3">
                These labels are names only. Stopping this share does not delete a copy someone already saved, and it does not revoke the achievement.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </RecruiterWorkspaceShell>
  );
}

function isInstitutionClaim(value: string) {
  return /institution/i.test(value);
}
