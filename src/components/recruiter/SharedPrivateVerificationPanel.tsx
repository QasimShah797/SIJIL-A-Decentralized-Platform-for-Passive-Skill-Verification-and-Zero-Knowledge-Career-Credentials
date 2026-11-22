import { Check, ExternalLink, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import type { PublicPrivateResultView } from "@/lib/public-credential";
import { cn } from "@/lib/utils";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function claimTitle(claimType: string): string {
  if (claimType === "moodle_learning") return "Moodle Learning";
  if (claimType === "peer_review") return "Peer Review";
  if (claimType === "github_activity") return "GitHub Activity";
  if (claimType === "practical_assessment") return "Practical Assessment";
  return claimType;
}

function resultTone(status: string): "verified" | "failed" | "pending" | "neutral" {
  if (status === "confirmed") return "verified";
  if (status === "failed" || status === "invalid" || status === "tampered") return "failed";
  if (status === "pending" || status === "preparing") return "pending";
  return "neutral";
}

export function readPrivateResults(payload: Record<string, unknown>): PublicPrivateResultView[] {
  const raw = Array.isArray(payload.privateResults) ? payload.privateResults : [];
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => {
      const threshold = typeof item.threshold === "string" ? item.threshold : null;
      const validated = item.proofType === "Groth16" && threshold !== null;
      const status = item.status === "confirmed" && !validated ? "unavailable" : String(item.status ?? "");
      return {
        claimType: String(item.claimType ?? ""),
        status,
        label: status === "confirmed" ? "VERIFIED"
          : status === "preparing" || status === "unavailable" ? "Could not confirm" : String(item.label ?? "Could not confirm"),
        detailHidden: String(item.detailHidden ?? ""),
        policyId: typeof item.policyId === "string" ? item.policyId : null,
        circuitId: typeof item.circuitId === "string" ? item.circuitId : null,
        verifiedBy: typeof item.verifiedBy === "string" ? item.verifiedBy : null,
        threshold: validated ? threshold : null,
        proofType: validated ? "Groth16" : null,
      };
    })
    .filter((item) => item.claimType);
}

export function privateProofRequirement(result: PublicPrivateResultView): string | null {
  if (!result.proofType || !result.threshold) return null;
  const unit = result.claimType === "github_activity" ? " verified commits"
    : result.claimType === "peer_review" ? " eligible review" : "%";
  return `${result.proofType} · ≥${result.threshold}${unit}`;
}

export function countConfirmedPrivateResults(payload: Record<string, unknown>): number {
  return readPrivateResults(payload).filter((item) => item.status === "confirmed").length;
}

export function SharedPrivateVerificationPanel({
  payload,
  competencyName,
  selectedFields = [],
  createdAt,
  expiresAt,
  proofType,
  verifyHref,
}: {
  payload: Record<string, unknown>;
  competencyName: string;
  selectedFields?: string[];
  createdAt?: string | null;
  expiresAt?: string | null;
  proofType?: string | null;
  verifyHref?: string | null;
}) {
  const privateResults = readPrivateResults(payload);
  const modes = asRecord(payload.evidenceModes);
  const selective = asRecord(payload.selectiveDisclosure);
  const issuerStatus = typeof selective?.issuerSignature === "string"
    ? selective.issuerSignature
    : typeof selective?.signatureStatus === "string"
      ? selective.signatureStatus
      : null;

  const expired = Boolean(expiresAt && Date.parse(expiresAt) < Date.now());

  return (
    <div id="credential-verification" className="space-y-4 scroll-mt-24">
      <div className="rounded-xl border border-[#e2e8f0] bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-sijil-blue">Credential verification</p>
            <p className="mt-0.5 text-xs text-[#64748b]">
              Only learner-shared proofs and fields for {competencyName}. Exact private values stay hidden.
            </p>
          </div>
          {verifyHref ? (
            <Link
              to={verifyHref}
              className="inline-flex items-center gap-1.5 rounded-lg border border-sijil-blue/20 bg-[hsl(var(--sijil-blue)/0.08)] px-3 py-1.5 text-xs font-semibold text-sijil-blue hover:bg-[hsl(var(--sijil-blue)/0.12)]"
            >
              View Verification <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          ) : null}
        </div>

        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-[#94a3b8]">Credential</dt>
            <dd className="mt-0.5 text-sm font-semibold text-[#0f172a]">{competencyName}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-[#94a3b8]">Presentation</dt>
            <dd className="mt-0.5 text-sm text-[#334155]">{proofType || "Signed selective disclosure"}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-[#94a3b8]">Shared</dt>
            <dd className="mt-0.5 text-sm text-[#334155]">
              {createdAt ? new Date(createdAt).toLocaleDateString() : "—"}
              {expiresAt ? ` · expires ${new Date(expiresAt).toLocaleDateString()}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-[#94a3b8]">Credential status</dt>
            <dd className={cn("mt-0.5 text-sm font-medium", expired ? "text-[#b45309]" : "text-[#15803d]")}>
              {expired ? "Expired" : "Active share"}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-[#94a3b8]">Issuer signature</dt>
            <dd className="mt-0.5 text-sm font-medium text-[#334155]">
              {issuerStatus === "valid" ? "Valid" : issuerStatus ?? "Not advertised on this share"}
            </dd>
          </div>
        </dl>

        {selectedFields.length > 0 ? (
          <div className="mt-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-[#94a3b8]">Selective disclosure</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {selectedFields.map((field) => (
                <span key={field} className="rounded-full bg-[hsl(var(--sijil-blue)/0.04)] px-2.5 py-1 text-[11px] font-medium text-[#334155]">
                  {field.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {modes ? (
          <div className="mt-3 text-xs text-[#64748b]">
            Evidence modes:{" "}
            {Object.entries(modes)
              .filter(([, mode]) => mode && mode !== "omit")
              .map(([key, mode]) => `${key.replace(/_/g, " ")} (${String(mode)})`)
              .join(" · ") || "none shared"}
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-[#e2e8f0] bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-sijil-blue" />
          <p className="text-sm font-semibold text-sijil-blue">Private verification results</p>
        </div>
        <p className="mt-0.5 text-xs text-[#64748b]">
          Labels reflect SIJIL cryptographic checks on learner-shared proofs only.
        </p>

        {privateResults.length === 0 ? (
          <p className="mt-4 text-sm text-[#64748b]">
            No private ZKP results were shared for this credential. The learner may have chosen details or omit for all evidence types.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {privateResults.map((result) => {
              const tone = resultTone(result.status);
              return (
                <li
                  key={`${result.claimType}-${result.policyId ?? ""}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#f1f5f9] px-3 py-2 text-sm"
                >
                  <span className="font-medium text-[#0f172a]">
                    {claimTitle(result.claimType)}
                    {result.proofType && result.threshold && (
                      <span className="ml-2 text-xs font-normal text-[#64748b]">
                        {privateProofRequirement(result)}
                      </span>
                    )}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 font-medium",
                      tone === "verified" && "text-[#15803d]",
                      tone === "failed" && "text-[#b91c1c]",
                      tone === "pending" && "text-[#b45309]",
                      tone === "neutral" && "text-[#64748b]",
                    )}
                  >
                    {tone === "verified" ? <Check className="h-3.5 w-3.5" /> : null}
                    {result.label}
                    {tone === "verified" && result.detailHidden ? ` · ${result.detailHidden}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
