-- Moodle sync tables required by moodle-sync edge function (sync_activities).
-- Idempotent — safe to run in Supabase SQL Editor when db push fails.
-- Connection metadata lives in lms_connections (not moodle_connections).

CREATE TABLE IF NOT EXISTS public.moodle_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  moodle_course_id bigint NOT NULL,
  fullname text NOT NULL,
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
  name text NOT NULL,
  module_type text NOT NULL DEFAULT 'assign',
  submission_status text,
  grade numeric,
  grade_max numeric,
  grade_formatted text,
  graded_at timestamptz,
  submitted_at timestamptz,
  grade_released boolean NOT NULL DEFAULT false,
  competency_tags jsonb,
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

ALTER TABLE public.moodle_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moodle_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moodle_grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moodle_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imported_lms_evidence ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "moodle_courses_select_own" ON public.moodle_courses
    FOR SELECT TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "moodle_courses_insert_own" ON public.moodle_courses
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "moodle_courses_update_own" ON public.moodle_courses
    FOR UPDATE TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "moodle_courses_delete_own" ON public.moodle_courses
    FOR DELETE TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "moodle_assign_select_own" ON public.moodle_assignments
    FOR SELECT TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "moodle_assign_insert_own" ON public.moodle_assignments
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "moodle_assign_update_own" ON public.moodle_assignments
    FOR UPDATE TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "moodle_assign_delete_own" ON public.moodle_assignments
    FOR DELETE TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "moodle_grades_select_own" ON public.moodle_grades
    FOR SELECT TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "moodle_grades_insert_own" ON public.moodle_grades
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "moodle_grades_update_own" ON public.moodle_grades
    FOR UPDATE TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "moodle_grades_delete_own" ON public.moodle_grades
    FOR DELETE TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "moodle_feedback_select_own" ON public.moodle_feedback
    FOR SELECT TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "moodle_feedback_insert_own" ON public.moodle_feedback
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "moodle_feedback_update_own" ON public.moodle_feedback
    FOR UPDATE TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "moodle_feedback_delete_own" ON public.moodle_feedback
    FOR DELETE TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "imported_lms_ev_select_own" ON public.imported_lms_evidence
    FOR SELECT TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "imported_lms_ev_insert_own" ON public.imported_lms_evidence
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "imported_lms_ev_update_own" ON public.imported_lms_evidence
    FOR UPDATE TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "imported_lms_ev_delete_own" ON public.imported_lms_evidence
    FOR DELETE TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS moodle_courses_user_idx ON public.moodle_courses (user_id, synced_at DESC);
CREATE INDEX IF NOT EXISTS moodle_assignments_user_course_idx
  ON public.moodle_assignments (user_id, moodle_course_id, synced_at DESC);
CREATE INDEX IF NOT EXISTS moodle_grades_user_idx ON public.moodle_grades (user_id, moodle_course_id);
CREATE INDEX IF NOT EXISTS imported_lms_evidence_user_idx ON public.imported_lms_evidence (user_id, imported_at DESC);

NOTIFY pgrst, 'reload schema';
