-- Hosted mcq_task_attempts columns that are not in the original table migration.
-- Institutional attestation columns are intentionally absent. The hosted project
-- does not have them, and credential issuance does not use them.

ALTER TABLE public.mcq_task_attempts
  ADD COLUMN IF NOT EXISTS percentage numeric,
  ADD COLUMN IF NOT EXISTS correct_count integer,
  ADD COLUMN IF NOT EXISTS total_questions integer,
  ADD COLUMN IF NOT EXISTS evidence_package jsonb,
  ADD COLUMN IF NOT EXISTS classification jsonb,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS type text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;
