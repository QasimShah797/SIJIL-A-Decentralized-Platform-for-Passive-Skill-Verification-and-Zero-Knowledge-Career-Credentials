import { ZKP_UI_ENABLED } from "@/lib/zkp-ui";
import { useEffect, useMemo, useState } from "react";
import {
  CompetencyPackageCard,
  EvidenceInspectorCard,
  type InspectorSource,
} from "@/components/wallet/WalletWorkspacePanels";
import {
  buildEvidenceLedger,
  inspectorViewFromLedger,
} from "@/lib/public-credential";
import type { SharedCredentialView } from "@/lib/shared-presentation";
import {
  SharedPrivateVerificationPanel,
  countConfirmedPrivateResults,
} from "@/components/recruiter/SharedPrivateVerificationPanel";

export type RecruiterSkillCard = {
  id: string;
  name: string;
  domain: string | null;
  createdAt: string;
  expiresAt: string | null;
  competencyId: string;
  selectedFields: string[];
  payload: Record<string, unknown>;
  presentationId: string;
  token: string | null;
  proofType: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function recruiterSkillCards(credentials: SharedCredentialView[]): RecruiterSkillCard[] {
  const seen = new Set<string>();
  const cards: RecruiterSkillCard[] = [];

  for (const credential of credentials) {
    const payload = credential.disclosedPayload ?? {};
    const competency = asRecord(payload.competency) ?? {};
    const skillRows = Array.isArray(payload.skills)
      ? payload.skills.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
      : [];
    const rows = skillRows.length > 0
      ? skillRows
      : [{
          competencyId: competency.competencyId ?? credential.presentationId,
          name: credential.skill ?? credential.title,
          domain: competency.domain ?? credential.subtitle,
        }];

    for (const row of rows) {
      const name = asText(row.name) || credential.skill || credential.title;
      const key = name.toLowerCase();
      if (!name || seen.has(key)) continue;
      seen.add(key);
      cards.push({
        id: `${credential.presentationId}:${asText(row.competencyId) || name}`,
        name,
        domain: asText(row.domain) || credential.subtitle,
        createdAt: credential.createdAt,
        expiresAt: credential.expiresAt,
        competencyId: asText(row.competencyId) || asText(competency.competencyId) || name,
        selectedFields: credential.selectedFields,
        payload,
        presentationId: credential.presentationId,
        token: credential.token,
        proofType: credential.proofType,
      });
    }
  }

  return cards;
}

export function displayRecruiterSkillName(name: string) {
  const trimmed = name.trim();
  if (!trimmed || trimmed !== trimmed.toLowerCase()) return trimmed;
  return trimmed.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function countSharedZkpConfirmations(credentials: SharedCredentialView[]): number {
  return credentials.reduce((total, credential) => (
    total + countConfirmedPrivateResults(credential.disclosedPayload ?? {})
  ), 0);
}

export function RecruiterCompetencyDetail({
  card,
  section = "all",
}: {
  card: RecruiterSkillCard;
  learnerUserId?: string;
  section?: "all" | "evidence" | "requests";
}) {
  const [source, setSource] = useState<InspectorSource>("github");
  const inspector = useMemo(() => {
    const ledger = buildEvidenceLedger(card.payload, card.competencyId, card.selectedFields);
    return inspectorViewFromLedger(ledger);
  }, [card.payload, card.competencyId, card.selectedFields]);

  useEffect(() => {
    if (!inspector.availableSources.includes(source)) {
      setSource(inspector.availableSources[0] ?? "github");
    }
  }, [inspector.availableSources, source]);

  const showEvidence = section !== "requests";
  const showPrivate = ZKP_UI_ENABLED && section !== "evidence";
  // Public share tokens are hashed server-side; recruiter-only shares verify in-panel.
  const verifyHref = card.token
    ? `/recruiter/verify/${encodeURIComponent(card.token)}`
    : "#credential-verification";

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {showEvidence ? (
        <>
          <CompetencyPackageCard
            competencyName={displayRecruiterSkillName(card.name)}
            github={inspector.github}
            lmsRows={inspector.lmsRows}
            taskLabel={inspector.taskDetail}
          />
          <EvidenceInspectorCard
            source={source}
            onSourceChange={setSource}
            availableSources={inspector.availableSources}
            githubRepos={inspector.githubRepos}
            lmsAssignments={inspector.lmsAssignments}
            taskDetail={inspector.taskDetail}
            reviews={inspector.reviews}
            verifyUrl={inspector.verifyUrl}
          />
        </>
      ) : null}
      {showPrivate ? (
        <div className="xl:col-span-2">
          <SharedPrivateVerificationPanel
            payload={card.payload}
            competencyName={displayRecruiterSkillName(card.name)}
            selectedFields={card.selectedFields}
            createdAt={card.createdAt}
            expiresAt={card.expiresAt}
            proofType={card.proofType}
            verifyHref={verifyHref}
          />
          <p className="mt-2 text-xs text-[#64748b]">
            Shared means the learner permitted this achievement. A private result is verified only after SIJIL accepts the cryptographic check for evidence linked to this credential.
          </p>
        </div>
      ) : null}
    </div>
  );
}
