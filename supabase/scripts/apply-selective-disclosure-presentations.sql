-- Run in Supabase Dashboard → SQL Editor (project admin).
-- Fixes: "Could not find the table 'public.selective_disclosure_presentations' in the schema cache"
--
-- Requires: public.declared_skills, public.tg_set_updated_at(), public.has_role()
-- If CREATE TABLE fails on declared_skills FK, apply supabase/migrations/20260607120000_domain_data_tables.sql first.

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

DROP POLICY IF EXISTS "selective_disclosure_presentations_select_recruiter" ON public.selective_disclosure_presentations;
CREATE POLICY "selective_disclosure_presentations_select_recruiter"
  ON public.selective_disclosure_presentations
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'recruiter')
    AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > now())
  );

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

-- Refresh PostgREST schema cache (usually automatic within ~1 minute).
NOTIFY pgrst, 'reload schema';

-- Allow recruiters to browse learner directory (safe if already applied).
DROP POLICY IF EXISTS "recruiter read learners" ON public.learner_profiles;
CREATE POLICY "recruiter read learners"
  ON public.learner_profiles
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'recruiter'));

-- Career / profile columns for My Profile + recruiter directory cards.
ALTER TABLE public.learner_profiles
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS career_goal text,
  ADD COLUMN IF NOT EXISTS skills_summary text,
  ADD COLUMN IF NOT EXISTS avatar_url text;
