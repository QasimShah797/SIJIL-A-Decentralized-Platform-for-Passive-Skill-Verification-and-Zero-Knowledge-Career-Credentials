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
import { AssessmentProofRequestCard } from "@/components/recruiter/AssessmentProofRequestCard";
import { GitHubActivityRequestCard } from "@/components/recruiter/GitHubActivityRequestCard";

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

export function RecruiterCompetencyDetail({
  card,
  learnerUserId,
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
  const showRequests = section !== "evidence";

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
      {showRequests && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(card.presentationId) ? (
        <div className="xl:col-span-2">
          <div className="space-y-3">
            <div>
              <h2 className="text-base font-semibold text-[#0f172a]">Request Private Verification</h2>
              <p className="mt-1 text-sm text-[#64748b]">Practical task score and GitHub activity can be requested. Moodle performance and skill progression are not ready. A request never shows the exact score or commit count.</p>
            </div>
            <AssessmentProofRequestCard presentationId={card.presentationId} />
            {learnerUserId ? <GitHubActivityRequestCard learnerUserId={learnerUserId} /> : null}
          </div>
          <p className="mt-2 text-xs text-[#64748b]">Shared means the learner permitted this achievement. A proof is verified only after the server accepts the cryptographic check. A signature check, a revocation check, and a ledger check are separate.</p>
        </div>
      ) : null}
    </div>
  );
}
