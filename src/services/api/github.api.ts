/**
 * GitHub integration API — backend sync and evidence with Supabase fallback.
 */
import { tryApiRequest } from "./client";

export interface SkillLinkApiView {
  skillId: string;
  skillName: string;
  matchReason: string | null;
  linkedAt: string;
}

export interface ProjectEvidenceApiView {
  repoId: string;
  githubRepoId: number;
  repositoryName: string;
  repoFullName: string;
  repositoryUrl: string;
  description: string | null;
  primaryLanguage: string | null;
  languageBreakdown: Record<string, number>;
  topics: string[];
  lastUpdated: string | null;
  commitCount: number | null;
  evidenceRecordId: string;
  skillLinks: SkillLinkApiView[];
}

export interface GitHubEvidenceView {
  id: string;
  source: string;
  status: string;
  repositoryName: string;
  repositoryUrl: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  lastUpdated: string | null;
  commitCount: number | null;
  prSummary: Record<string, unknown> | null;
  syncDate: string;
  suggestedSkillId: string | null;
  suggestedSkillName: string | null;
  mappedSkillId: string | null;
  githubRepoId: number | null;
}

export interface GitHubSyncApiResult {
  status: string;
  reposFetched: number;
  evidenceCreated: number;
  activitiesSynced: number;
  contributorsSynced: number;
  logId: string;
}

export async function syncGitHubApi(
  declaredSkills?: { id: string; name: string; domain?: string }[],
): Promise<GitHubSyncApiResult | null> {
  return tryApiRequest<GitHubSyncApiResult>("/integrations/github/sync", {
    method: "POST",
    body: JSON.stringify({ declaredSkills }),
  });
}

export async function getLinkedProjectEvidenceApi(): Promise<ProjectEvidenceApiView[] | null> {
  return tryApiRequest<ProjectEvidenceApiView[]>("/integrations/github/linked-projects");
}

export async function getGitHubEvidenceApi(): Promise<GitHubEvidenceView[] | null> {
  return tryApiRequest<GitHubEvidenceView[]>("/integrations/github/evidence");
}

export async function getUnmappedEvidenceApi(): Promise<GitHubEvidenceView[] | null> {
  return tryApiRequest<GitHubEvidenceView[]>("/evidence/unmapped");
}

export async function linkEvidenceToSkillApi(
  skillId: string,
  evidenceId: string,
): Promise<GitHubEvidenceView | null> {
  return tryApiRequest<GitHubEvidenceView>(`/skills/${skillId}/evidence/link`, {
    method: "POST",
    body: JSON.stringify({ evidenceId }),
  });
}

export async function unlinkEvidenceFromSkillApi(
  skillId: string,
  evidenceId: string,
): Promise<GitHubEvidenceView | null> {
  return tryApiRequest<GitHubEvidenceView>(`/skills/${skillId}/evidence/unlink`, {
    method: "POST",
    body: JSON.stringify({ evidenceId }),
  });
}

export async function unlinkRepoEvidenceApi(repoId: string, skillId?: string): Promise<boolean> {
  const result = await tryApiRequest<null>("/integrations/github/unlink-repo", {
    method: "POST",
    body: JSON.stringify({ repoId, skillId }),
  });
  return result !== null;
}

export async function ignoreEvidenceApi(evidenceId: string): Promise<boolean> {
  const result = await tryApiRequest<GitHubEvidenceView>(`/evidence/${evidenceId}/ignore`, {
    method: "PATCH",
  });
  return result !== null;
}

export async function getGitHubSyncStatusApi(): Promise<{ status: string } | null> {
  return tryApiRequest<{ status: string }>("/integrations/github/sync-status");
}
