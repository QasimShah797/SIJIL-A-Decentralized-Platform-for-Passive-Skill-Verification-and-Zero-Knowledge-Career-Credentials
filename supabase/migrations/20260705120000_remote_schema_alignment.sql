-- Align remote Supabase with frontend/backend expectations.
-- Idempotent — safe to run in SQL Editor when db push fails.
-- Generated from live schema diff (supabase gen types vs repo migrations).

-- ── learner_profiles: self-signup location fields ──
ALTER TABLE public.learner_profiles
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS graduation_year integer;

COMMENT ON COLUMN public.learner_profiles.date_of_birth IS 'Learner date of birth (self-signup)';
COMMENT ON COLUMN public.learner_profiles.gender IS 'Learner gender (self-signup)';
COMMENT ON COLUMN public.learner_profiles.country IS 'Country of residence (self-signup)';
COMMENT ON COLUMN public.learner_profiles.city IS 'City of residence (self-signup)';
COMMENT ON COLUMN public.learner_profiles.graduation_year IS 'Expected or actual graduation year';

-- ── evidence_records: project evidence extensions ──
ALTER TABLE public.evidence_records
  ADD COLUMN IF NOT EXISTS evidence_type text NOT NULL DEFAULT 'Project Evidence',
  ADD COLUMN IF NOT EXISTS language_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS repo_full_name text;

-- ── github_repos: language/topics for skill matching ──
ALTER TABLE public.github_repos
  ADD COLUMN IF NOT EXISTS language_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS topics jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS dependencies jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ── skill_evidence_links: match metadata ──
ALTER TABLE public.skill_evidence_links
  ADD COLUMN IF NOT EXISTS match_reason text,
  ADD COLUMN IF NOT EXISTS match_signals jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ── github_repo_skill_links: multi-skill repo links (404 on remote today) ──
CREATE TABLE IF NOT EXISTS public.github_repo_skill_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  github_repo_id uuid NOT NULL REFERENCES public.github_repos(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES public.declared_skills(id) ON DELETE CASCADE,
  evidence_record_id uuid REFERENCES public.evidence_records(id) ON DELETE SET NULL,
  match_reason text,
  linked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (github_repo_id, skill_id)
);

ALTER TABLE public.github_repo_skill_links ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "github_repo_skill_links_select_own" ON public.github_repo_skill_links
    FOR SELECT TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "github_repo_skill_links_insert_own" ON public.github_repo_skill_links
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "github_repo_skill_links_update_own" ON public.github_repo_skill_links
    FOR UPDATE TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "github_repo_skill_links_delete_own" ON public.github_repo_skill_links
    FOR DELETE TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS github_repo_skill_links_repo_idx
  ON public.github_repo_skill_links (github_repo_id);
CREATE INDEX IF NOT EXISTS github_repo_skill_links_skill_idx
  ON public.github_repo_skill_links (skill_id);

-- ── lms_connections: Moodle metadata (uses existing table, not moodle_connections) ──
ALTER TABLE public.lms_connections
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS moodle_user_id bigint,
  ADD COLUMN IF NOT EXISTS moodle_email text,
  ADD COLUMN IF NOT EXISTS institution_email text;

COMMENT ON COLUMN public.lms_connections.provider IS 'LMS provider: moodle, odoo, etc.';

CREATE INDEX IF NOT EXISTS lms_connections_provider_idx
  ON public.lms_connections (user_id, provider)
  WHERE provider IS NOT NULL;

NOTIFY pgrst, 'reload schema';
