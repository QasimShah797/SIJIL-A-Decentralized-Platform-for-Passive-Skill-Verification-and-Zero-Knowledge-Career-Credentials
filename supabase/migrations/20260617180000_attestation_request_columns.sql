-- Ensure institution_attestation_requests has all required columns

ALTER TABLE public.institution_attestation_requests
  ADD COLUMN IF NOT EXISTS competency_name text,
  ADD COLUMN IF NOT EXISTS competency_domain text,
  ADD COLUMN IF NOT EXISTS skill_id uuid,
  ADD COLUMN IF NOT EXISTS evidence_package jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS practical_task_result jsonb,
  ADD COLUMN IF NOT EXISTS github_evidence jsonb,
  ADD COLUMN IF NOT EXISTS moodle_evidence jsonb,
  ADD COLUMN IF NOT EXISTS certificate_evidence jsonb,
  ADD COLUMN IF NOT EXISTS peer_review_evidence jsonb,
  ADD COLUMN IF NOT EXISTS current_stage text DEFAULT 'institution_attestation_pending';
