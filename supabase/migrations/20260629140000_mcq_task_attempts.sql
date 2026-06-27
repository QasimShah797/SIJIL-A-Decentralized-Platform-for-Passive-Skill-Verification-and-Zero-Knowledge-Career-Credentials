-- Secure MCQ practical task attempts (answer_key never exposed to client queries)

CREATE TABLE IF NOT EXISTS public.mcq_task_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_id uuid REFERENCES public.declared_skills(id) ON DELETE CASCADE,
  competency_name text NOT NULL,
  competency_domain text NOT NULL DEFAULT 'General',
  questions jsonb NOT NULL,
  answer_key jsonb NOT NULL,
  learner_answers jsonb,
  status text NOT NULL DEFAULT 'in_progress',
  passed boolean NOT NULL DEFAULT false,
  feedback text,
  title text,
  duration_minutes int NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz
);

CREATE INDEX IF NOT EXISTS mcq_task_attempts_learner_skill_idx
  ON public.mcq_task_attempts (learner_user_id, skill_id);

ALTER TABLE public.mcq_task_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Learners can read own mcq attempts" ON public.mcq_task_attempts;
CREATE POLICY "Learners can read own mcq attempts"
  ON public.mcq_task_attempts
  FOR SELECT
  TO authenticated
  USING (auth.uid() = learner_user_id);

DROP POLICY IF EXISTS "Learners can insert own mcq attempts" ON public.mcq_task_attempts;
CREATE POLICY "Learners can insert own mcq attempts"
  ON public.mcq_task_attempts
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = learner_user_id);

DROP POLICY IF EXISTS "Learners can update own mcq attempts" ON public.mcq_task_attempts;
CREATE POLICY "Learners can update own mcq attempts"
  ON public.mcq_task_attempts
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = learner_user_id);

-- Learner-safe view without answer_key (prefer edge functions; view for optional client reads)
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
  created_at,
  submitted_at
FROM public.mcq_task_attempts;

GRANT SELECT ON public.mcq_task_attempts_learner TO authenticated;
