import { useMemo, useState } from "react";
import { CheckCircle2, Loader2, ShieldAlert, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { verifyCredentialApi } from "@/services/api/recruiter.api";
import { resolveSsiDidApi } from "@/services/api/ssi.api";
import {
  buildSsiVerifyFindings,
  extractDisclosedCredentialIdentity,
  formatSsiVerifyDetail,
  mapSsiCredentialVerifyToUiState,
  mapVerifyApiError,
  pickSharedCredentialId,
  ssiVerifyStateLabel,
  type SsiVerifyFinding,
  type SsiVerifyUiState,
} from "@/lib/recruiter-ssi-verify";
import { cn } from "@/lib/utils";
import type { LedgerVerifyResult } from "@/services/api/ledger.api";

type Props = {
  payload: Record<string, unknown>;
  versionCredentialId?: string | null;
  sharedAt?: string | null;
  className?: string;
};

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const time = Date.parse(value);
  if (Number.isNaN(time)) return value;
  return new Date(time).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function badgeVariant(state: SsiVerifyUiState): "verified" | "destructive" | "warning" | "neutral" | "pending" {
  switch (state) {
    case "verified":
      return "verified";
    case "failed":
    case "revoked":
      return "destructive";
    case "expired":
    case "evidence_unavailable":
      return "warning";
    case "pending_anchor":
    case "loading":
      return "pending";
    default:
      return "neutral";
  }
}

/** Share-safe labels from verify checks — never invents undisclosed issuer/DID strings. */
function issuerDisplay(
  disclosed: string | null,
  checks: LedgerVerifyResult["checks"] | undefined,
  state: SsiVerifyUiState,
): string {
  if (disclosed) return disclosed;
  if (state === "idle" || state === "loading") return "Not disclosed";
  if (checks?.issuer === "trusted") return "Authenticity confirmed (details not disclosed)";
  if (checks?.issuer === "untrusted") return "Issuer check failed (details not disclosed)";
  if (state === "verified" || state === "pending_anchor") {
    return "Checked privately (not disclosed in this share)";
  }
  return "Not disclosed";
}

function didDisplay(
  disclosed: string | null,
  checks: LedgerVerifyResult["checks"] | undefined,
  state: SsiVerifyUiState,
  resolvedDid: string | null,
): string {
  if (disclosed) return resolvedDid || disclosed;
  if (state === "idle" || state === "loading") return "Not disclosed";
  if (checks?.holder === "bound") return "Holder binding confirmed (DID not disclosed)";
  if (checks?.holder === "mismatch") return "Holder binding failed (DID not disclosed)";
  return "Not disclosed";
}

export function SsiVerifyCredentialCard({
  payload,
  versionCredentialId = null,
  sharedAt = null,
  className,
}: Props) {
  const identity = useMemo(
    () => extractDisclosedCredentialIdentity(payload, versionCredentialId),
    [payload, versionCredentialId],
  );
  const credentialId = useMemo(
    () => pickSharedCredentialId({ versionCredentialId, payload }),
    [versionCredentialId, payload],
  );

  const [state, setState] = useState<SsiVerifyUiState>("idle");
  const [detail, setDetail] = useState<string | null>(null);
  const [resolvedDid, setResolvedDid] = useState<string | null>(null);
  const [checks, setChecks] = useState<LedgerVerifyResult["checks"] | undefined>(undefined);
  const [findings, setFindings] = useState<SsiVerifyFinding[]>([]);

  const issuedAtLabel = formatDate(identity.issuedAt) ?? formatDate(sharedAt);
  const canVerify = Boolean(credentialId);
  const showResult = state !== "idle" && state !== "loading";

  const runVerify = async () => {
    if (!credentialId) {
      const next: SsiVerifyUiState = "unable";
      const message = "No issued credential id was included in this share.";
      setState(next);
      setDetail(message);
      setChecks(undefined);
      setFindings([{ label: "Credential", detail: message, ok: false }]);
      return;
    }

    setState("loading");
    setDetail(null);
    setResolvedDid(null);
    setChecks(undefined);
    setFindings([]);

    try {
      if (identity.did) {
        try {
          const resolved = await resolveSsiDidApi(identity.did);
          setResolvedDid(resolved.verificationMethod || resolved.publicKeyFingerprint || resolved.did);
        } catch {
          // DID resolve is best-effort; credential verify remains the source of truth.
        }
      }

      const result = await verifyCredentialApi(credentialId);
      const next = mapSsiCredentialVerifyToUiState(result);
      const nextDetail = formatSsiVerifyDetail(result, next);
      setState(next);
      setChecks(result.checks);
      setDetail(nextDetail);
      setFindings(buildSsiVerifyFindings(result, next, nextDetail));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Verification unavailable";
      const cleaned = message.replace(/^API \d+:\s*/i, "");
      const next = mapVerifyApiError(message);
      setState(next);
      setDetail(cleaned);
      setChecks(undefined);
      setFindings([{ label: "Request", detail: cleaned, ok: false }]);
    }
  };

  return (
    <div className={cn("space-y-4", className)}>
      <div className="rounded-xl border border-[#e2e8f0] bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <dl className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
            <MetaRow
              label="Issuer"
              value={issuerDisplay(identity.issuer, checks, state)}
              mono={false}
            />
            <MetaRow label="Issue date" value={issuedAtLabel ?? "Not disclosed"} mono={false} />
            <MetaRow
              label="DID"
              value={didDisplay(identity.did, checks, state, resolvedDid)}
              mono
            />
            {identity.did && resolvedDid ? (
              <MetaRow label="DID resolution" value={resolvedDid} mono />
            ) : null}
          </dl>
          {state !== "idle" ? (
            <StatusBadge variant={badgeVariant(state)} icon={
              state === "loading" ? <Loader2 className="h-3 w-3 animate-spin" /> :
                state === "verified" ? <ShieldCheck className="h-3 w-3" /> :
                  <ShieldAlert className="h-3 w-3" />
            }>
              {ssiVerifyStateLabel(state)}
            </StatusBadge>
          ) : null}
        </div>

        <div className="mt-4">
          <Button
            type="button"
            size="sm"
            onClick={() => void runVerify()}
            disabled={state === "loading" || !canVerify}
            className="rounded-lg"
          >
            {state === "loading" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Verifying…
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4" />
                Verify Credential
              </>
            )}
          </Button>
          {!canVerify ? (
            <p className="mt-2 text-xs text-[#64748b]">
              This share does not include an issued credential id, so SSI verification cannot run.
            </p>
          ) : null}
        </div>
      </div>

      {showResult ? (
        <VerifyResultPanel passed={state === "verified"} findings={findings} detail={detail} />
      ) : null}
    </div>
  );
}

function VerifyResultPanel({
  passed,
  findings,
  detail,
}: {
  passed: boolean;
  findings: SsiVerifyFinding[];
  detail: string | null;
}) {
  const rows = findings.length > 0
    ? findings
    : [{ label: "Result", detail: detail || (passed ? "Verification passed." : "Verification did not pass."), ok: passed }];

  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        passed
          ? "border-emerald-200 bg-emerald-50"
          : "border-red-200 bg-red-50",
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-2">
        {passed ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
        ) : (
          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" aria-hidden />
        )}
        <div className="min-w-0">
          <p className={cn("text-sm font-semibold", passed ? "text-emerald-900" : "text-red-900")}>
            {passed ? "Verification passed" : "Verification failed"}
          </p>
          <ul className="mt-3 space-y-2">
            {rows.map((row) => (
              <li
                key={`${row.label}-${row.detail}`}
                className={cn(
                  "rounded-lg border px-3 py-2 text-xs leading-relaxed",
                  passed || row.ok
                    ? "border-emerald-200/80 bg-white/70 text-emerald-950"
                    : "border-red-200/80 bg-white/70 text-red-950",
                )}
              >
                <span className="font-semibold">{row.label}: </span>
                <span>{row.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function MetaRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-[#94a3b8]">{label}</dt>
      <dd className={cn(
        "mt-0.5 break-all text-sm text-[#0f172a]",
        mono && "font-mono text-xs",
      )}>
        {value}
      </dd>
    </div>
  );
}
