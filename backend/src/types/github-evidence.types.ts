/**
 * GitHub evidence record and sync types.
 */
export type LanguageBreakdown = Record<string, number>;

export interface SkillLinkView {
  skillId: string;
  skillName: string;
  matchReason: string | null;
  linkedAt: string;
}

export interface EvidenceRecordRow {
  id: string;
  user_id: string;
  source: string;
  external_id: string;
  evidence_type: string;
  status: string;
  repository_name: string;
  repository_url: string;
  repo_full_name: string | null;
  description: string | null;
  language: string | null;
  language_breakdown: LanguageBreakdown;
  stars: number;
  forks: number;
  last_updated: string | null;
  commit_count: number | null;
  pr_summary: Record<string, unknown> | null;
  sync_date: string;
  suggested_skill_id: string | null;
  suggested_skill_name: string | null;
  mapped_skill_id: string | null;
  github_repo_id: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface EvidenceRecordView {
  id: string;
  source: string;
  evidenceType: string;
  status: string;
  repositoryName: string;
  repositoryUrl: string;
  repoFullName: string | null;
  description: string | null;
  language: string | null;
  languageBreakdown: LanguageBreakdown;
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
  skillLinks: SkillLinkView[];
  matchReason: string | null;
}

export interface ProjectEvidenceView {
  repoId: string;
  githubRepoId: number;
  repositoryName: string;
  repoFullName: string;
  repositoryUrl: string;
  description: string | null;
  primaryLanguage: string | null;
  languageBreakdown: LanguageBreakdown;
  topics: string[];
  lastUpdated: string | null;
  commitCount: number | null;
  evidenceRecordId: string;
  skillLinks: SkillLinkView[];
}

export interface GitHubSyncLogView {
  id: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  reposFetched: number;
  evidenceCreated: number;
  errorMessage: string | null;
}

export interface GitHubSyncResult {
  status: string;
  reposFetched: number;
  evidenceCreated: number;
  activitiesSynced: number;
  contributorsSynced: number;
  logId: string;
}

export interface LinkEvidenceInput {
  evidenceId: string;
}
