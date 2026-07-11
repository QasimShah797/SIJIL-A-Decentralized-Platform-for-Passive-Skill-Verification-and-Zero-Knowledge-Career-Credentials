CREATE TABLE IF NOT EXISTS public.selective_disclosure_presentations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  competency_id uuid NOT NULL REFERENCES public.declared_skills(id) ON DELETE CASCADE,
  selected_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  selection_mode text NOT NULL DEFAULT 'custom',
  disclosed_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload_hash text NOT NULL,
  proof_type text NOT NULL,
  proof_value text,
  verification_method text,
  share_token_hash text NOT NULL,
  share_token_hint text,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (share_token_hash)
);

ALTER TABLE public.selective_disclosure_presentations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "selective_disclosure_presentations_select_own" ON public.selective_disclosure_presentations;
CREATE POLICY "selective_disclosure_presentations_select_own"
  ON public.selective_disclosure_presentations
  FOR SELECT
  TO authenticated
  USING (auth.uid() = learner_id);

DROP POLICY IF EXISTS "selective_disclosure_presentations_insert_own" ON public.selective_disclosure_presentations;
CREATE POLICY "selective_disclosure_presentations_insert_own"
  ON public.selective_disclosure_presentations
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = learner_id);

DROP POLICY IF EXISTS "selective_disclosure_presentations_update_own" ON public.selective_disclosure_presentations;
CREATE POLICY "selective_disclosure_presentations_update_own"
  ON public.selective_disclosure_presentations
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = learner_id);

CREATE INDEX IF NOT EXISTS selective_disclosure_presentations_learner_idx
  ON public.selective_disclosure_presentations (learner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS selective_disclosure_presentations_competency_idx
  ON public.selective_disclosure_presentations (competency_id, created_at DESC);

CREATE INDEX IF NOT EXISTS selective_disclosure_presentations_active_idx
  ON public.selective_disclosure_presentations (share_token_hash, revoked_at, expires_at);

DROP TRIGGER IF EXISTS trg_selective_disclosure_presentations_updated_at ON public.selective_disclosure_presentations;
CREATE TRIGGER trg_selective_disclosure_presentations_updated_at
  BEFORE UPDATE ON public.selective_disclosure_presentations
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
