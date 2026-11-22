import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CompetencyPackageCard, EvidenceInspectorCard, type InspectorSource } from "@/components/wallet/WalletWorkspacePanels";
import { ShareRevokedState, ShareUnavailableState } from "@/components/public/ShareRevokedState";
import { PublicSurfaceLayout } from "@/components/sijil/PublicSurfaceLayout";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { PageSkeleton } from "@/components/sijil/SkeletonLoader";
import { mapLedgerStatusToBadge, shareShowsVerified } from "@/lib/ledger-status";
import { isBlockchainVerified, skillTrustFromRow } from "@/lib/share-trust";
import {
  buildEvidenceLedger,
  competencyFromSharePayload,
  inspectorViewFromLedger,
  publicCredentialPath,
  type PublicCompetencyResponse,
} from "@/lib/public-credential";
import { getPublicCompetencyApi, getPublicCredentialApi } from "@/services/api/public-credential.api";

async function loadPublicCompetency(shareToken: string, competencyId: string): Promise<PublicCompetencyResponse> {
  const credential = await getPublicCredentialApi(shareToken).catch(() => null);
  const ledgerStatus = credential?.ledgerStatus ?? "ledger_unavailable";
  const verified = shareShowsVerified({
    ledgerStatus,
    verified: credential?.verified,
    detail: credential?.ledgerDetail,
  });

  try {
    const competency = await getPublicCompetencyApi(shareToken, competencyId);
    return {
      ...competency,
      ledgerStatus: competency.ledgerStatus ?? ledgerStatus,
      verified: shareShowsVerified({
        ledgerStatus: competency.ledgerStatus ?? ledgerStatus,
        verified: competency.verified,
        detail: competency.ledgerDetail ?? credential?.ledgerDetail,
      }),
    };
  } catch {
    if (!credential) {
      throw new Error("This competency was not included in the share");
    }
    if (credential.status !== "valid" || !credential.webView) {
      return {
        status: credential?.status === "valid" ? "invalid" : (credential?.status ?? "invalid"),
        verified,
        verifiedAt: credential?.verifiedAt ?? null,
        competency: null,
        ledger: null,
        ledgerStatus,
        ledgerDetail: credential?.ledgerDetail ?? null,
      };
    }
    const competency = competencyFromSharePayload(
      credential.webView.disclosedPayload,
      competencyId,
      credential.competencyId,
    );
    if (!competency) {
      throw new Error("This competency was not included in the share");
    }
    const skillRow = Array.isArray(credential.webView.disclosedPayload.skills)
      ? credential.webView.disclosedPayload.skills.find((item) => {
        return Boolean(item) && typeof item === "object" && (item as { competencyId?: string }).competencyId === competencyId;
      }) as Record<string, unknown> | undefined
      : undefined;
    const skillTrust = skillTrustFromRow(skillRow ?? { issued: false });
    const skillLedgerStatus = skillTrust.ledgerStatus;
    const rawPrivate = Array.isArray(credential.webView.disclosedPayload.privateResults)
      ? credential.webView.disclosedPayload.privateResults
      : [];
    const privateResults = rawPrivate
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .map((item) => ({
        claimType: String(item.claimType ?? ""),
        status: String(item.status ?? ""),
        label: String(item.label ?? ""),
        detailHidden: String(item.detailHidden ?? ""),
        policyId: typeof item.policyId === "string" ? item.policyId : null,
        circuitId: typeof item.circuitId === "string" ? item.circuitId : null,
        verifiedBy: typeof item.verifiedBy === "string" ? item.verifiedBy : null,
      }))
      .filter((item) => item.claimType && item.label);
    return {
      status: "valid",
      verified: isBlockchainVerified(skillLedgerStatus, skillTrust.ledgerDetail),
      verifiedAt: credential.verifiedAt,
      competency,
      ledger: buildEvidenceLedger(
        credential.webView.disclosedPayload,
        competencyId,
        credential.selectedFields,
      ),
      ledgerStatus: skillLedgerStatus,
      ledgerDetail: skillTrust.ledgerDetail,
      privateResults,
    };
  }
}

export default function PublicCompetencyPage() {
  const { shareToken, competencyId } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<PublicCompetencyResponse | null>(null);
  const [inspectorSource, setInspectorSource] = useState<InspectorSource>("github");

  useEffect(() => {
    if (!shareToken || !competencyId) {
      setLoading(false);
      setError("missing");
      return;
    }
    let active = true;
    setLoading(true);
    loadPublicCompetency(shareToken, competencyId)
      .then((next) => {
        if (active) setPayload(next);
      })
      .catch(() => {
        if (active) setError("missing");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [shareToken, competencyId]);

  const inspector = useMemo(
    () => inspectorViewFromLedger(payload?.ledger ?? []),
    [payload?.ledger],
  );
  const ledgerBadge = mapLedgerStatusToBadge(payload?.ledgerStatus, payload?.ledgerDetail);

  useEffect(() => {
    if (!inspector.availableSources.includes(inspectorSource)) {
      setInspectorSource(inspector.availableSources[0] ?? "github");
    }
  }, [inspector.availableSources, inspectorSource]);

  return (
    <PublicSurfaceLayout accent="strong">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {shareToken ? (
          <Link to={publicCredentialPath(shareToken)} className="text-xs font-medium text-primary hover:underline">
            Back to public resume
          </Link>
        ) : null}
        <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-primary">Public competency</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {payload?.competency?.name ?? "Competency evidence"}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Click a competency name on the resume to inspect its evidence package. LMS items stay pre-verified; GitHub, tasks, and reviews are corroborating.
        </p>

        {loading ? (
          <div className="mt-8"><PageSkeleton rows={4} /></div>
        ) : error === "missing" || !payload ? (
          <div className="mt-8"><ShareUnavailableState status="missing" /></div>
        ) : payload.status === "revoked" ? (
          <div className="mt-8"><ShareRevokedState /></div>
        ) : payload.status === "expired" ? (
          <div className="mt-8"><ShareUnavailableState status="expired" /></div>
        ) : payload.status === "invalid" ? (
          <div className="mt-8"><ShareUnavailableState status="invalid" /></div>
        ) : (
          <div className="mt-8 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {payload.competency?.domain ? (
                <StatusBadge variant="neutral">{payload.competency.domain}</StatusBadge>
              ) : null}
              <StatusBadge variant={ledgerBadge.variant}>
                {ledgerBadge.label}
              </StatusBadge>
            </div>
            {payload.competency?.description ? (
              <p className="text-sm text-muted-foreground">{payload.competency.description}</p>
            ) : null}
            {payload.privateResults && payload.privateResults.length > 0 ? (
              <div className="rounded-xl border border-[#e2e8f0] bg-white p-4 shadow-sm">
                <p className="text-sm font-semibold text-[#023E8A]">Private verification results</p>
                <p className="mt-0.5 text-xs text-[#64748b]">
                  Exact scores, activity counts, and review details stay hidden. Labels reflect SIJIL cryptographic checks only.
                </p>
                <ul className="mt-3 space-y-2">
                  {payload.privateResults.map((result) => {
                    const title =
                      result.claimType === "moodle_learning" ? "Moodle Learning"
                        : result.claimType === "peer_review" ? "Peer Review"
                          : result.claimType === "github_activity" ? "GitHub Activity"
                            : result.claimType === "practical_assessment" ? "Practical Assessment"
                              : result.claimType;
                    const confirmed = result.status === "confirmed";
                    const label = result.status === "preparing"
                      ? "Could not confirm"
                      : result.label;
                    return (
                      <li
                        key={`${result.claimType}-${result.policyId ?? ""}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#f1f5f9] px-3 py-2 text-sm"
                      >
                        <span className="font-medium text-[#0f172a]">{title}</span>
                        <span className={confirmed ? "font-semibold text-[#15803d]" : "font-medium text-[#64748b]"}>
                          {label}
                          {confirmed && result.detailHidden ? ` · ${result.detailHidden}` : ""}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.95fr)]">
              <CompetencyPackageCard
                competencyName={payload.competency?.name ?? "this competency"}
                github={inspector.github}
                lmsRows={inspector.lmsRows}
                taskLabel={inspector.taskDetail}
              />
              <EvidenceInspectorCard
                source={inspectorSource}
                onSourceChange={setInspectorSource}
                availableSources={inspector.availableSources}
                githubRepos={inspector.githubRepos}
                lmsAssignments={inspector.lmsAssignments}
                taskDetail={inspector.taskDetail}
                reviews={inspector.reviews}
                verifyUrl={inspector.verifyUrl}
              />
            </div>
          </div>
        )}
      </div>
    </PublicSurfaceLayout>
  );
}
