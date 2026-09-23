import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CompetencyPackageCard, EvidenceInspectorCard, type InspectorSource } from "@/components/wallet/WalletWorkspacePanels";
import { ShareRevokedState, ShareUnavailableState } from "@/components/public/ShareRevokedState";
import { PublicSurfaceLayout } from "@/components/sijil/PublicSurfaceLayout";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import {
  buildEvidenceLedger,
  competencyFromSharePayload,
  inspectorViewFromLedger,
  publicCredentialPath,
  type PublicCompetencyResponse,
} from "@/lib/public-credential";
import { getPublicCompetencyApi, getPublicCredentialApi } from "@/services/api/public-credential.api";

async function loadPublicCompetency(shareToken: string, competencyId: string): Promise<PublicCompetencyResponse> {
  try {
    return await getPublicCompetencyApi(shareToken, competencyId);
  } catch {
    const credential = await getPublicCredentialApi(shareToken);
    if (credential.status !== "valid" || !credential.webView) {
      return {
        status: credential.status === "valid" ? "invalid" : credential.status,
        verified: credential.verified,
        verifiedAt: credential.verifiedAt,
        competency: null,
        ledger: null,
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
    return {
      status: "valid",
      verified: credential.verified,
      verifiedAt: credential.verifiedAt,
      competency,
      ledger: buildEvidenceLedger(
        credential.webView.disclosedPayload,
        competencyId,
        credential.selectedFields,
      ),
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
          <p className="mt-8 text-sm text-muted-foreground">Loading evidence…</p>
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
            {payload.competency?.domain ? (
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge variant="neutral">{payload.competency.domain}</StatusBadge>
              </div>
            ) : null}
            {payload.competency?.description ? (
              <p className="text-sm text-muted-foreground">{payload.competency.description}</p>
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
