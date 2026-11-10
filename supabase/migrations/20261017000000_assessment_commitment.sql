-- Trusted assessment commitments.
-- Public commitment columns live on the completed attempt.
-- The private opening (score and blinding) lives in assessment_openings.
-- Learners can read their own opening. They cannot write attempts or openings.
-- Anonymous and recruiter roles cannot read openings or answer keys.
-- service_role can create an in-progress attempt and can read both tables.
-- Only finalize_mcq_attempt can complete an attempt and insert its opening,
-- and that function writes both rows in one transaction.
-- This migration does not require institutional attestation columns.
-- Credential issuance does not wait for institutional approval.

ALTER TABLE public.mcq_task_attempts
  ADD COLUMN IF NOT EXISTS commitment text,
  ADD COLUMN IF NOT EXISTS commitment_scheme text,
  ADD COLUMN IF NOT EXISTS commitment_circuit_id text,
  ADD COLUMN IF NOT EXISTS commitment_version integer;

ALTER TABLE public.mcq_task_attempts
  DROP CONSTRAINT IF EXISTS mcq_task_attempts_commitment_decimal_check;

ALTER TABLE public.mcq_task_attempts
  ADD CONSTRAINT mcq_task_attempts_commitment_decimal_check
  CHECK (commitment IS NULL OR commitment ~ '^(0|[1-9][0-9]*)$');

CREATE TABLE IF NOT EXISTS public.assessment_openings (
  attempt_id uuid PRIMARY KEY REFERENCES public.mcq_task_attempts(id) ON DELETE CASCADE,
  learner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score integer NOT NULL CHECK (score >= 0 AND score <= 100),
  blinding text NOT NULL CHECK (blinding ~ '^(0|[1-9][0-9]*)$' AND length(blinding) <= 78),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assessment_openings_learner_idx
  ON public.assessment_openings (learner_user_id);

ALTER TABLE public.assessment_openings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Learners read own assessment openings" ON public.assessment_openings;
CREATE POLICY "Learners read own assessment openings"
  ON public.assessment_openings
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = learner_user_id
    AND NOT public.has_role(auth.uid(), 'recruiter')
  );

DROP POLICY IF EXISTS "Learners can insert own mcq attempts" ON public.mcq_task_attempts;
DROP POLICY IF EXISTS "Learners can update own mcq attempts" ON public.mcq_task_attempts;

REVOKE ALL ON TABLE public.mcq_task_attempts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.mcq_task_attempts TO service_role;
GRANT SELECT (
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
  created_at,
  submitted_at,
  percentage,
  correct_count,
  total_questions,
  evidence_package,
  classification,
  commitment,
  commitment_scheme,
  commitment_circuit_id,
  commitment_version
) ON TABLE public.mcq_task_attempts TO authenticated;

REVOKE ALL ON TABLE public.assessment_openings FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.assessment_openings TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_mcq_task_attempt()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'in_progress'
       OR NEW.passed IS TRUE
       OR NEW.percentage IS NOT NULL
       OR NEW.correct_count IS NOT NULL
       OR NEW.total_questions IS NOT NULL
       OR NEW.learner_answers IS NOT NULL
       OR NEW.submitted_at IS NOT NULL
       OR NEW.feedback IS NOT NULL
       OR NEW.commitment IS NOT NULL
       OR NEW.commitment_scheme IS NOT NULL
       OR NEW.commitment_circuit_id IS NOT NULL
       OR NEW.commitment_version IS NOT NULL
    THEN
      RAISE EXCEPTION 'mcq attempts can only be created in progress without a result';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM 'in_progress'
       OR NEW.status IS DISTINCT FROM 'completed'
       OR current_setting('sijil.finalize_mcq', true) IS DISTINCT FROM '1'
    THEN
      RAISE EXCEPTION 'completed assessment results are immutable';
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.learner_user_id IS DISTINCT FROM OLD.learner_user_id
       OR NEW.skill_id IS DISTINCT FROM OLD.skill_id
       OR NEW.competency_name IS DISTINCT FROM OLD.competency_name
       OR NEW.competency_domain IS DISTINCT FROM OLD.competency_domain
       OR NEW.questions IS DISTINCT FROM OLD.questions
       OR NEW.answer_key IS DISTINCT FROM OLD.answer_key
       OR NEW.title IS DISTINCT FROM OLD.title
       OR NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.evidence_package IS DISTINCT FROM OLD.evidence_package
       OR NEW.classification IS DISTINCT FROM OLD.classification
    THEN
      RAISE EXCEPTION 'assessment identity and answer key cannot change';
    END IF;

    IF NEW.percentage IS NULL
       OR NEW.percentage < 0
       OR NEW.percentage > 100
       OR NEW.percentage <> trunc(NEW.percentage)
       OR NEW.correct_count IS NULL
       OR NEW.correct_count < 0
       OR NEW.total_questions IS NULL
       OR NEW.total_questions < 1
       OR NEW.learner_answers IS NULL
       OR NEW.submitted_at IS NULL
       OR NEW.commitment IS NULL
       OR NEW.commitment !~ '^(0|[1-9][0-9]*)$'
       OR NEW.commitment_scheme IS DISTINCT FROM 'poseidon-bn254-v1'
       OR NEW.commitment_circuit_id IS DISTINCT FROM 'score-threshold-v1'
       OR NEW.commitment_version IS DISTINCT FROM 1
    THEN
      RAISE EXCEPTION 'completed assessment is missing a trusted commitment';
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'mcq attempt change is not allowed';
END;
$$;

DROP TRIGGER IF EXISTS guard_mcq_task_attempt ON public.mcq_task_attempts;
CREATE TRIGGER guard_mcq_task_attempt
  BEFORE INSERT OR UPDATE ON public.mcq_task_attempts
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_mcq_task_attempt();

CREATE OR REPLACE FUNCTION public.guard_assessment_opening()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  attempt public.mcq_task_attempts%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF pg_trigger_depth() > 1 THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'assessment openings cannot be deleted';
  END IF;

  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'assessment openings are immutable';
  END IF;

  IF current_setting('sijil.finalize_mcq', true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'assessment openings are written only during trusted grading';
  END IF;

  SELECT * INTO attempt
  FROM public.mcq_task_attempts
  WHERE id = NEW.attempt_id;

  IF NOT FOUND OR attempt.status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'opening requires a completed attempt';
  END IF;

  IF attempt.learner_user_id IS DISTINCT FROM NEW.learner_user_id
     OR attempt.percentage IS DISTINCT FROM NEW.score::numeric
     OR attempt.commitment IS NULL
  THEN
    RAISE EXCEPTION 'opening does not match the trusted assessment commitment';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_assessment_opening ON public.assessment_openings;
CREATE TRIGGER guard_assessment_opening
  BEFORE INSERT OR UPDATE OR DELETE ON public.assessment_openings
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_assessment_opening();

CREATE OR REPLACE FUNCTION public.finalize_mcq_attempt(
  p_attempt_id uuid,
  p_learner_user_id uuid,
  p_learner_answers jsonb,
  p_correct_count integer,
  p_total_questions integer,
  p_percentage integer,
  p_passed boolean,
  p_feedback text,
  p_submitted_at timestamptz,
  p_commitment text,
  p_commitment_scheme text,
  p_commitment_circuit_id text,
  p_commitment_version integer,
  p_blinding text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_percentage IS NULL OR p_percentage < 0 OR p_percentage > 100 THEN
    RAISE EXCEPTION 'completed assessment is missing a trusted commitment';
  END IF;

  PERFORM set_config('sijil.finalize_mcq', '1', true);

  PERFORM 1
  FROM public.mcq_task_attempts
  WHERE id = p_attempt_id
    AND learner_user_id = p_learner_user_id
    AND status = 'in_progress'
  FOR UPDATE;

  UPDATE public.mcq_task_attempts
  SET
    learner_answers = p_learner_answers,
    correct_count = p_correct_count,
    total_questions = p_total_questions,
    percentage = p_percentage,
    passed = p_passed,
    status = 'completed',
    feedback = p_feedback,
    submitted_at = p_submitted_at,
    commitment = p_commitment,
    commitment_scheme = p_commitment_scheme,
    commitment_circuit_id = p_commitment_circuit_id,
    commitment_version = p_commitment_version
  WHERE id = p_attempt_id
    AND learner_user_id = p_learner_user_id
    AND status = 'in_progress';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'assessment attempt is not awaiting evaluation';
  END IF;

  INSERT INTO public.assessment_openings (
    attempt_id,
    learner_user_id,
    score,
    blinding
  ) VALUES (
    p_attempt_id,
    p_learner_user_id,
    p_percentage,
    p_blinding
  );
END;
$$;

REVOKE ALL ON FUNCTION public.guard_mcq_task_attempt() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_assessment_opening() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.finalize_mcq_attempt(
  uuid, uuid, jsonb, integer, integer, integer, boolean, text, timestamptz, text, text, text, integer, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_mcq_attempt(
  uuid, uuid, jsonb, integer, integer, integer, boolean, text, timestamptz, text, text, text, integer, text
) TO service_role;

DROP VIEW IF EXISTS public.mcq_task_attempts_learner;
CREATE VIEW public.mcq_task_attempts_learner
WITH (security_invoker = true) AS
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
  created_at,
  submitted_at,
  commitment,
  commitment_scheme,
  commitment_circuit_id,
  commitment_version
FROM public.mcq_task_attempts;

REVOKE ALL ON TABLE public.mcq_task_attempts_learner FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.mcq_task_attempts_learner TO authenticated;
