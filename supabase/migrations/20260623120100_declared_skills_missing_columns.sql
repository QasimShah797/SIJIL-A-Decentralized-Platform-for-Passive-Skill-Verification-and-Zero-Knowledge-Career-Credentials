-- Align declared_skills with app expectations (remote projects may predate full migrations)
ALTER TABLE public.declared_skills
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS pipeline_stage text NOT NULL DEFAULT 'declared';

CREATE INDEX IF NOT EXISTS declared_skills_pipeline_idx
  ON public.declared_skills (user_id, pipeline_stage);
