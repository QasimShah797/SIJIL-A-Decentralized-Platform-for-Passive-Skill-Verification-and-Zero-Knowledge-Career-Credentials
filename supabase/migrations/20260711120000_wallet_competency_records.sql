CREATE TABLE IF NOT EXISTS public.wallet_competency_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  competency_id uuid NOT NULL REFERENCES public.declared_skills(id) ON DELETE CASCADE,
  competency_name text NOT NULL,
  status text NOT NULL,
  practical_task_status text,
  evidence_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (learner_id, competency_id)
);

ALTER TABLE public.wallet_competency_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wallet_competency_records_select_own" ON public.wallet_competency_records;
CREATE POLICY "wallet_competency_records_select_own"
  ON public.wallet_competency_records
  FOR SELECT
  TO authenticated
  USING (auth.uid() = learner_id);

DROP POLICY IF EXISTS "wallet_competency_records_insert_own" ON public.wallet_competency_records;
CREATE POLICY "wallet_competency_records_insert_own"
  ON public.wallet_competency_records
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = learner_id);

DROP POLICY IF EXISTS "wallet_competency_records_update_own" ON public.wallet_competency_records;
CREATE POLICY "wallet_competency_records_update_own"
  ON public.wallet_competency_records
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = learner_id);

CREATE INDEX IF NOT EXISTS wallet_competency_records_learner_updated_idx
  ON public.wallet_competency_records (learner_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS wallet_competency_records_competency_idx
  ON public.wallet_competency_records (competency_id);

DROP TRIGGER IF EXISTS trg_wallet_competency_records_updated_at ON public.wallet_competency_records;
CREATE TRIGGER trg_wallet_competency_records_updated_at
  BEFORE UPDATE ON public.wallet_competency_records
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
