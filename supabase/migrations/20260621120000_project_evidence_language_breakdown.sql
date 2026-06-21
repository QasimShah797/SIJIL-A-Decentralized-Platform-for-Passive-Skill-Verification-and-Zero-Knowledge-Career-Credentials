-- Project evidence: language breakdown, multi-skill links, match reasons

ALTER TABLE public.github_repos
  ADD COLUMN IF NOT EXISTS language_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS topics jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS dependencies jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.evidence_records
  ADD COLUMN IF NOT EXISTS evidence_type text NOT NULL DEFAULT 'Project Evidence',
  ADD COLUMN IF NOT EXISTS language_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS repo_full_name text;

ALTER TABLE public.skill_evidence_links
  ADD COLUMN IF NOT EXISTS match_reason text,
  ADD COLUMN IF NOT EXISTS match_signals jsonb NOT NULL DEFAULT '{}'::jsonb;

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

CREATE POLICY "github_repo_skill_links_select_own" ON public.github_repo_skill_links
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "github_repo_skill_links_insert_own" ON public.github_repo_skill_links
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "github_repo_skill_links_delete_own" ON public.github_repo_skill_links
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS github_repo_skill_links_repo_idx
  ON public.github_repo_skill_links (github_repo_id);
CREATE INDEX IF NOT EXISTS github_repo_skill_links_skill_idx
  ON public.github_repo_skill_links (skill_id);
