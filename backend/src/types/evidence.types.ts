/**
 * Evidence and supporting record types.
 */
export interface SupportingRecordRow {
  id: string;
  user_id: string;
  skill_id: string | null;
  source: string;
  title: string;
  url: string | null;
  occurred_at: string;
  created_at: string;
}

export interface EvidenceView {
  id: string;
  skillId: string;
  source: string;
  title: string;
  url: string | null;
  occurredAt: string;
  status: string;
}

export interface SubmitEvidenceInput {
  skillId: string;
  title: string;
  url?: string;
  source?: string;
}

export interface UpdateEvidenceStatusInput {
  status: string;
}
