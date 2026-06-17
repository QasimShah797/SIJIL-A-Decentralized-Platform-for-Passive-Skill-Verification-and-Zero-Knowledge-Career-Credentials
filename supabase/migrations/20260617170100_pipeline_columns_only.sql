ALTER TABLE public.declared_skills
  ADD COLUMN IF NOT EXISTS pipeline_stage text NOT NULL DEFAULT 'declared';

ALTER TABLE public.practical_attempts
  ADD COLUMN IF NOT EXISTS passed boolean,
  ADD COLUMN IF NOT EXISTS score numeric,
  ADD COLUMN IF NOT EXISTS feedback text;

CREATE INDEX IF NOT EXISTS declared_skills_pipeline_idx
  ON public.declared_skills (user_id, pipeline_stage);
