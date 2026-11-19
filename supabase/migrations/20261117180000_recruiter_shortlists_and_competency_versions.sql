-- Recruiter-owned shortlists and forward-looking competency versions.
-- Apply only with explicit approval. This file does not rewrite credentials,
-- invent historical versions, or write blockchain transaction ids.

BEGIN;

CREATE TABLE IF NOT EXISTS public.recruiter_shortlist_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiter_user_id uuid NOT NULL REFERENCES auth.users(id),
  learner_user_id uuid NOT NULL REFERENCES auth.users(id),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recruiter_shortlist_distinct CHECK (recruiter_user_id <> learner_user_id),
  CONSTRAINT recruiter_shortlist_once UNIQUE (recruiter_user_id, learner_user_id)
);

CREATE INDEX IF NOT EXISTS recruiter_shortlist_recruiter_idx
  ON public.recruiter_shortlist_entries (recruiter_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.competency_credential_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_user_id uuid NOT NULL REFERENCES auth.users(id),
  competency_key text NOT NULL,
  skill_name text NOT NULL,
  version_number integer NOT NULL CHECK (version_number > 0),
  previous_version_id uuid REFERENCES public.competency_credential_versions(id),
  credential_id uuid REFERENCES public.credentials(id),
  status text NOT NULL CHECK (status IN ('pending_evidence', 'issued')),
  evidence_source text NOT NULL CHECK (evidence_source IN ('github', 'moodle', 'practical')),
  evidence_reference text NOT NULL,
  evidence_summary text NOT NULL,
  evidence_fingerprint text NOT NULL,
  validation_reference text,
  anchor_status text NOT NULL DEFAULT 'not_requested' CHECK (anchor_status IN ('not_requested', 'unavailable', 'confirmed', 'failed')),
  anchor_tx_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT competency_versions_once UNIQUE (learner_user_id, competency_key, version_number),
  CONSTRAINT competency_versions_anchor_truth CHECK (
    (anchor_status = 'confirmed' AND anchor_tx_id IS NOT NULL)
    OR (anchor_status <> 'confirmed' AND anchor_tx_id IS NULL)
  ),
  CONSTRAINT competency_versions_issue_truth CHECK (
    status <> 'issued' OR (credential_id IS NOT NULL AND validation_reference IS NOT NULL)
  ),
  CONSTRAINT competency_versions_evidence_once UNIQUE (learner_user_id, competency_key, evidence_fingerprint)
);

CREATE UNIQUE INDEX IF NOT EXISTS competency_versions_credential_once
  ON public.competency_credential_versions (credential_id)
  WHERE credential_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS competency_versions_validation_once
  ON public.competency_credential_versions (validation_reference)
  WHERE validation_reference IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS competency_versions_evidence_ref_once
  ON public.competency_credential_versions (learner_user_id, competency_key, evidence_reference);

CREATE INDEX IF NOT EXISTS competency_versions_learner_idx
  ON public.competency_credential_versions (learner_user_id, competency_key, version_number);

ALTER TABLE public.recruiter_shortlist_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competency_credential_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recruiter_shortlist_own ON public.recruiter_shortlist_entries;
CREATE POLICY recruiter_shortlist_own
  ON public.recruiter_shortlist_entries
  FOR ALL
  TO authenticated
  USING (auth.uid() = recruiter_user_id)
  WITH CHECK (auth.uid() = recruiter_user_id);

DROP POLICY IF EXISTS competency_versions_owner_read ON public.competency_credential_versions;
CREATE POLICY competency_versions_owner_read
  ON public.competency_credential_versions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = learner_user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recruiter_shortlist_entries TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.competency_credential_versions TO service_role;
GRANT SELECT ON public.competency_credential_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recruiter_shortlist_entries TO authenticated;

COMMIT;
