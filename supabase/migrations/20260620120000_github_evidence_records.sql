-- Professional GitHub evidence records, sync logs, and skill-evidence links

CREATE TABLE IF NOT EXISTS public.evidence_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'GitHub',
  external_id text NOT NULL,
  status text NOT NULL DEFAULT 'Unmapped Evidence',
  repository_name text NOT NULL,
  repository_url text NOT NULL,
  description text,
  language text,
  stars integer NOT NULL DEFAULT 0,
  forks integer NOT NULL DEFAULT 0,
  last_updated timestamptz,
  commit_count integer,
  pr_summary jsonb,
  sync_date timestamptz NOT NULL DEFAULT now(),
  suggested_skill_id uuid REFERENCES public.declared_skills(id) ON DELETE SET NULL,
  suggested_skill_name text,
  mapped_skill_id uuid REFERENCES public.declared_skills(id) ON DELETE SET NULL,
  github_repo_id bigint,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, external_id)
);

CREATE TABLE IF NOT EXISTS public.github_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'Not Synced',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  repos_fetched integer NOT NULL DEFAULT 0,
  evidence_created integer NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.skill_evidence_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES public.declared_skills(id) ON DELETE CASCADE,
  evidence_record_id uuid NOT NULL REFERENCES public.evidence_records(id) ON DELETE CASCADE,
  linked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (skill_id, evidence_record_id)
);

ALTER TABLE public.evidence_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.github_sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_evidence_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "evidence_records_select_own" ON public.evidence_records
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "evidence_records_insert_own" ON public.evidence_records
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "evidence_records_update_own" ON public.evidence_records
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "evidence_records_delete_own" ON public.evidence_records
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "github_sync_logs_select_own" ON public.github_sync_logs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "github_sync_logs_insert_own" ON public.github_sync_logs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "github_sync_logs_update_own" ON public.github_sync_logs
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "skill_evidence_links_select_own" ON public.skill_evidence_links
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "skill_evidence_links_insert_own" ON public.skill_evidence_links
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "skill_evidence_links_delete_own" ON public.skill_evidence_links
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS evidence_records_user_status_idx
  ON public.evidence_records (user_id, status);
CREATE INDEX IF NOT EXISTS evidence_records_user_source_idx
  ON public.evidence_records (user_id, source);
CREATE INDEX IF NOT EXISTS github_sync_logs_user_created_idx
  ON public.github_sync_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS skill_evidence_links_skill_idx
  ON public.skill_evidence_links (skill_id);

CREATE TRIGGER trg_evidence_records_updated_at
  BEFORE UPDATE ON public.evidence_records
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
