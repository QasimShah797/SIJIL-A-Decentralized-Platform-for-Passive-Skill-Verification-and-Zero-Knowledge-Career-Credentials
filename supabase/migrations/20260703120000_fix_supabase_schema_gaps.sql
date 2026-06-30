-- Idempotent fix for remote Supabase schema gaps (400/404 REST errors)
-- Safe to re-run on projects missing recent migrations.

-- ── learner_profiles: self-signup + institution fields ──
ALTER TABLE public.learner_profiles
  ADD COLUMN IF NOT EXISTS institution_id uuid REFERENCES public.institution_profiles(user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS university_email text,
  ADD COLUMN IF NOT EXISTS city_country text,
  ADD COLUMN IF NOT EXISTS career_goal text,
  ADD COLUMN IF NOT EXISTS skills_summary text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS account_activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS portfolio_url text,
  ADD COLUMN IF NOT EXISTS batch text,
  ADD COLUMN IF NOT EXISTS holder_did text,
  ADD COLUMN IF NOT EXISTS profile_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS graduation_year integer;

DO $$ BEGIN
  CREATE TYPE public.learner_status AS ENUM ('email_pending', 'verified');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE public.learner_profiles
  ADD COLUMN IF NOT EXISTS status public.learner_status NOT NULL DEFAULT 'email_pending';

-- ── evidence_records + github_repo_skill_links ──
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

ALTER TABLE public.evidence_records
  ADD COLUMN IF NOT EXISTS evidence_type text NOT NULL DEFAULT 'Project Evidence',
  ADD COLUMN IF NOT EXISTS language_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS repo_full_name text,
  ADD COLUMN IF NOT EXISTS github_repo_id bigint,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.github_repos
  ADD COLUMN IF NOT EXISTS language_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS topics jsonb NOT NULL DEFAULT '[]'::jsonb;

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

ALTER TABLE public.evidence_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.github_repo_skill_links ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "evidence_records_select_own" ON public.evidence_records
    FOR SELECT TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "evidence_records_insert_own" ON public.evidence_records
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "evidence_records_update_own" ON public.evidence_records
    FOR UPDATE TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "evidence_records_delete_own" ON public.evidence_records
    FOR DELETE TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

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

CREATE INDEX IF NOT EXISTS evidence_records_user_status_idx
  ON public.evidence_records (user_id, status);
CREATE INDEX IF NOT EXISTS github_repo_skill_links_repo_idx
  ON public.github_repo_skill_links (github_repo_id);

-- ── Moodle LMS tables ──
CREATE TABLE IF NOT EXISTS public.moodle_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  moodle_user_id bigint NOT NULL,
  moodle_email text,
  institution_email text,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.moodle_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  moodle_course_id bigint NOT NULL,
  fullname text,
  shortname text,
  summary text,
  raw jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, moodle_course_id)
);

CREATE TABLE IF NOT EXISTS public.moodle_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  moodle_course_id bigint NOT NULL,
  moodle_assignment_id bigint NOT NULL,
  moodle_cmid bigint,
  name text,
  module_type text NOT NULL DEFAULT 'assign',
  submission_status text,
  grade numeric,
  grade_max numeric,
  grade_formatted text,
  graded_at timestamptz,
  submitted_at timestamptz,
  grade_released boolean NOT NULL DEFAULT false,
  competency_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, moodle_assignment_id)
);

CREATE TABLE IF NOT EXISTS public.moodle_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  moodle_assignment_id bigint NOT NULL,
  feedback_text text,
  grader_id bigint,
  raw jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, moodle_assignment_id)
);

CREATE TABLE IF NOT EXISTS public.moodle_grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  moodle_course_id bigint NOT NULL,
  item_id bigint NOT NULL,
  item_name text NOT NULL,
  item_type text,
  grade numeric,
  grade_max numeric,
  grade_formatted text,
  raw jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, moodle_course_id, item_id)
);

CREATE TABLE IF NOT EXISTS public.imported_lms_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'Moodle LMS',
  moodle_course_id bigint,
  moodle_assignment_id bigint,
  course_name text NOT NULL,
  activity_name text NOT NULL,
  activity_type text,
  grade text,
  grade_max text,
  submission_status text,
  feedback_preview text,
  lms_evidence_id uuid REFERENCES public.lms_evidence(id) ON DELETE SET NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, moodle_assignment_id)
);

ALTER TABLE public.moodle_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moodle_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moodle_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moodle_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moodle_grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imported_lms_evidence ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "moodle_conn_select_own" ON public.moodle_connections FOR SELECT TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "moodle_conn_insert_own" ON public.moodle_connections FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "moodle_conn_update_own" ON public.moodle_connections FOR UPDATE TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "moodle_conn_delete_own" ON public.moodle_connections FOR DELETE TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "moodle_courses_select_own" ON public.moodle_courses FOR SELECT TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "moodle_courses_insert_own" ON public.moodle_courses FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "moodle_courses_update_own" ON public.moodle_courses FOR UPDATE TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "moodle_courses_delete_own" ON public.moodle_courses FOR DELETE TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "moodle_assign_select_own" ON public.moodle_assignments FOR SELECT TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "moodle_assign_insert_own" ON public.moodle_assignments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "moodle_assign_update_own" ON public.moodle_assignments FOR UPDATE TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "moodle_assign_delete_own" ON public.moodle_assignments FOR DELETE TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "moodle_feedback_select_own" ON public.moodle_feedback FOR SELECT TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "moodle_feedback_insert_own" ON public.moodle_feedback FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "moodle_feedback_update_own" ON public.moodle_feedback FOR UPDATE TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "moodle_feedback_delete_own" ON public.moodle_feedback FOR DELETE TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "moodle_grades_select_own" ON public.moodle_grades FOR SELECT TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "moodle_grades_insert_own" ON public.moodle_grades FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "moodle_grades_update_own" ON public.moodle_grades FOR UPDATE TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "moodle_grades_delete_own" ON public.moodle_grades FOR DELETE TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "imported_lms_ev_select_own" ON public.imported_lms_evidence FOR SELECT TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "imported_lms_ev_insert_own" ON public.imported_lms_evidence FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "imported_lms_ev_update_own" ON public.imported_lms_evidence FOR UPDATE TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "imported_lms_ev_delete_own" ON public.imported_lms_evidence FOR DELETE TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS moodle_courses_user_idx ON public.moodle_courses (user_id, synced_at DESC);
CREATE INDEX IF NOT EXISTS moodle_assignments_user_course_idx ON public.moodle_assignments (user_id, moodle_course_id, synced_at DESC);
CREATE INDEX IF NOT EXISTS imported_lms_evidence_user_idx ON public.imported_lms_evidence (user_id, imported_at DESC);

NOTIFY pgrst, 'reload schema';
