/**
 * Skills API — backend layer for skill declaration with Supabase fallback in db/skills.ts.
 */
import { tryApiRequest } from "./client";
import type { DeclaredSkill } from "@/lib/sijil-data";

export interface SkillApiView {
  id: string;
  name: string;
  domain: string;
  description: string;
  status: string;
  pipelineStage: string;
  lastRelatedActivityAt: string | null;
  lastCredentialSyncAt: string | null;
}

export interface RelatedEvidenceApiView {
  id: string;
  source: string;
  evidenceType?: string;
  status: string;
  repositoryName: string;
  repositoryUrl: string;
  repoFullName?: string | null;
  description: string | null;
  language: string | null;
  languageBreakdown?: Record<string, number>;
  stars: number;
  forks: number;
  lastUpdated: string | null;
  commitCount: number | null;
  suggestedSkillId: string | null;
  suggestedSkillName: string | null;
  matchReason?: string | null;
  mappingConfidence: "high" | "medium" | "low";
}

export interface DeclaredSkillResultApiView {
  skill: SkillApiView;
  relatedEvidence: RelatedEvidenceApiView[];
  evidenceStatus: "none" | "matched" | "linked";
}

function toDeclaredSkill(s: SkillApiView): DeclaredSkill {
  return {
    id: s.id,
    name: s.name,
    domain: s.domain,
    description: s.description,
    status: s.status,
    pipelineStage: s.pipelineStage,
    lastRelatedActivityAt: s.lastRelatedActivityAt,
    lastCredentialSyncAt: s.lastCredentialSyncAt,
  };
}

export async function createSkillApi(
  skill: Pick<DeclaredSkill, "name"> & Partial<Pick<DeclaredSkill, "domain" | "description">>,
): Promise<DeclaredSkillResultApiView | null> {
  const result = await tryApiRequest<DeclaredSkillResultApiView>("/skills/declare", {
    method: "POST",
    body: JSON.stringify({
      name: skill.name,
      domain: skill.domain || "General",
      description: skill.description || "",
    }),
  });
  return result
    ? {
        ...result,
        skill: toDeclaredSkill(result.skill),
      }
    : null;
}

export async function declareSkillApi(
  skill: Pick<DeclaredSkill, "name"> & Partial<Pick<DeclaredSkill, "domain" | "description">>,
): Promise<DeclaredSkillResultApiView | null> {
  return createSkillApi(skill);
}

export async function listSkillsApi(): Promise<DeclaredSkill[] | null> {
  const result = await tryApiRequest<SkillApiView[]>("/skills");
  return result ? result.map(toDeclaredSkill) : null;
}

export async function deleteSkillApi(skillId: string): Promise<boolean> {
  const result = await tryApiRequest<null>(`/skills/${skillId}`, { method: "DELETE" });
  return result !== null;
}

export async function getRelatedEvidenceApi(
  skillId: string,
): Promise<DeclaredSkillResultApiView | null> {
  const result = await tryApiRequest<DeclaredSkillResultApiView>(`/skills/${skillId}/related-evidence`);
  return result
    ? {
        ...result,
        skill: toDeclaredSkill(result.skill),
      }
    : null;
}

export async function updateSkillApi(
  skillId: string,
  skill: Pick<DeclaredSkill, "name"> & Partial<Pick<DeclaredSkill, "domain" | "description">>,
): Promise<DeclaredSkill | null> {
  const result = await tryApiRequest<SkillApiView>(`/skills/${skillId}`, {
    method: "PATCH",
    body: JSON.stringify({
      name: skill.name,
      domain: skill.domain,
      description: skill.description,
    }),
  });
  return result ? toDeclaredSkill(result) : null;
}

export async function syncSkillEvidenceStatusApi(skillId?: string): Promise<boolean> {
  const path = skillId
    ? `/skills/${skillId}/sync-evidence-status`
    : "/skills/sync-evidence-status";
  const result = await tryApiRequest<unknown>(path, { method: "POST" });
  return result !== null;
}

export async function applySkillEventApi(
  skillId: string,
  type: "sync_evidence" | "attestation_submitted",
): Promise<boolean> {
  const result = await tryApiRequest<SkillApiView>(`/skills/${skillId}/events`, {
    method: "POST",
    body: JSON.stringify({ type }),
  });
  return result !== null;
}
