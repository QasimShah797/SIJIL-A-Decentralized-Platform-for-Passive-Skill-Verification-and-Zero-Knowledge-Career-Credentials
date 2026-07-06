-- MCQ evaluation results and institution attestation linkage

ALTER TABLE public.mcq_task_attempts
  ADD COLUMN IF NOT EXISTS percentage numeric,
  ADD COLUMN IF NOT EXISTS correct_count integer,
  ADD COLUMN IF NOT EXISTS total_questions integer,
  ADD COLUMN IF NOT EXISTS institution_attestation_request_id uuid,
  ADD COLUMN IF NOT EXISTS sent_to_institution_at timestamptz,
  ADD COLUMN IF NOT EXISTS evidence_package jsonb,
  ADD COLUMN IF NOT EXISTS classification jsonb;

ALTER TABLE public.institution_attestation_requests
  ADD COLUMN IF NOT EXISTS mcq_result jsonb,
  ADD COLUMN IF NOT EXISTS test_percentage numeric;

CREATE OR REPLACE VIEW public.mcq_task_attempts_learner AS
SELECT
  id,
  learner_user_id,
  skill_id,
  competency_name,
  competency_domain,
  questions,
  learner_answers,
  status,
  passed,
  feedback,
  title,
  duration_minutes,
  percentage,
  correct_count,
  total_questions,
  institution_attestation_request_id,
  sent_to_institution_at,
  created_at,
  submitted_at
FROM public.mcq_task_attempts;

GRANT SELECT ON public.mcq_task_attempts_learner TO authenticated;
