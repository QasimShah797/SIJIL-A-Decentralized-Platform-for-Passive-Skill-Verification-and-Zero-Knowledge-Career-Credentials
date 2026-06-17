-- Institution attestation requests with full evidence packages

CREATE TABLE IF NOT EXISTS public.supporting_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_id uuid REFERENCES public.declared_skills(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'Upload',
  title text NOT NULL,
  url text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.supporting_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "supporting_records_select_own" ON public.supporting_records
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "supporting_records_insert_own" ON public.supporting_records
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "supporting_records_select_institution" ON public.supporting_records
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'institution'));

CREATE TABLE IF NOT EXISTS public.institution_attestation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  learner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  learner_name text,
  learner_email text,

  skill_id uuid REFERENCES public.declared_skills(id) ON DELETE SET NULL,
  competency_name text NOT NULL,
  competency_domain text,

  institution_name text NOT NULL,
  institution_id uuid,

  status text NOT NULL DEFAULT 'pending',
  current_stage text NOT NULL DEFAULT 'institution_attestation_pending',

  evidence_package jsonb NOT NULL DEFAULT '{}'::jsonb,

  practical_task_result jsonb,
  github_evidence jsonb,
  moodle_evidence jsonb,
  certificate_evidence jsonb,
  peer_review_evidence jsonb,

  submitted_to_institution_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id),
  institution_feedback text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.institution_attestation_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "iar_select_learner" ON public.institution_attestation_requests
  FOR SELECT TO authenticated USING (auth.uid() = learner_user_id);

CREATE POLICY "iar_insert_learner" ON public.institution_attestation_requests
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = learner_user_id);

CREATE POLICY "iar_select_institution" ON public.institution_attestation_requests
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'institution'));

CREATE POLICY "iar_update_institution" ON public.institution_attestation_requests
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'institution'));

CREATE INDEX IF NOT EXISTS iar_learner_idx
  ON public.institution_attestation_requests (learner_user_id);
CREATE INDEX IF NOT EXISTS iar_institution_status_idx
  ON public.institution_attestation_requests (institution_name, status);
CREATE INDEX IF NOT EXISTS iar_skill_idx
  ON public.institution_attestation_requests (skill_id);
