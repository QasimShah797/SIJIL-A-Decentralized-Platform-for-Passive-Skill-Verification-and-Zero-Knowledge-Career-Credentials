/**
 * Skill declaration types shared across services and validators.
 */
export interface DeclaredSkillRow {
  id: string;
  user_id: string;
  name: string;
  domain: string;
  description: string | null;
  status: string;
  pipeline_stage: string;
  last_related_activity_at: string | null;
  last_credential_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SkillView {
  id: string;
  name: string;
  domain: string;
  description: string;
  status: string;
  pipelineStage: string;
  lastRelatedActivityAt: string | null;
  lastCredentialSyncAt: string | null;
}

export interface RelatedEvidenceView {
  id: string;
  source: string;
  evidenceType: string;
  status: string;
  repositoryName: string;
  repositoryUrl: string;
  repoFullName: string | null;
  description: string | null;
  language: string | null;
  languageBreakdown: Record<string, number>;
  stars: number;
  forks: number;
  lastUpdated: string | null;
  commitCount: number | null;
  suggestedSkillId: string | null;
  suggestedSkillName: string | null;
  matchReason: string | null;
  mappingConfidence: "high" | "medium" | "low";
}

export interface DeclaredSkillWithEvidenceView {
  skill: SkillView;
  relatedEvidence: RelatedEvidenceView[];
  evidenceStatus: "none" | "matched" | "linked";
}

export interface CreateSkillInput {
  name: string;
  domain?: string;
  description?: string;
}

export interface UpdateSkillInput {
  name?: string;
  domain?: string;
  description?: string;
  status?: string;
  pipelineStage?: string;
}
