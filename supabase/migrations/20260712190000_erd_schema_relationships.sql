-- =============================================================================
-- ERD-aligned schema relationships
-- Fills missing foreign keys / junction links from the SIJIL ERD that were
-- absent from the remote information_schema FK export, and adds credential /
-- verification / audit entities required by the diagram.
-- Idempotent — safe to re-run.
-- =============================================================================

-- ── helpers ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._add_fk_if_missing(
  p_table text,
  p_constraint text,
  p_sql text
) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF to_regclass(p_table) IS NULL THEN
    RAISE NOTICE 'skip FK % — table % missing', p_constraint, p_table;
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = p_constraint
  ) THEN
    BEGIN
      EXECUTE p_sql;
    EXCEPTION
      WHEN undefined_table THEN
        RAISE NOTICE 'skip FK % — table missing', p_constraint;
      WHEN undefined_column THEN
        RAISE NOTICE 'skip FK % — column missing', p_constraint;
      WHEN duplicate_object THEN
        NULL;
    END;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public._is_uuid_text(val text)
RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT val IS NOT NULL
    AND val ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
$$;

-- =============================================================================
-- 1) Core identity FKs (Profiles hub)
-- CSV had almost no profile/auth references for these tables.
-- =============================================================================

SELECT public._add_fk_if_missing(
  'public.user_roles',
  'user_roles_user_id_fkey',
  'ALTER TABLE public.user_roles
     ADD CONSTRAINT user_roles_user_id_fkey
     FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'
);

SELECT public._add_fk_if_missing(
  'public.learner_profiles',
  'learner_profiles_user_id_fkey',
  'ALTER TABLE public.learner_profiles
     ADD CONSTRAINT learner_profiles_user_id_fkey
     FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'
);

SELECT public._add_fk_if_missing(
  'public.recruiter_profiles',
  'recruiter_profiles_user_id_fkey',
  'ALTER TABLE public.recruiter_profiles
     ADD CONSTRAINT recruiter_profiles_user_id_fkey
     FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'
);

SELECT public._add_fk_if_missing(
  'public.recruiter_profiles',
  'recruiter_profiles_verified_by_fkey',
  'ALTER TABLE public.recruiter_profiles
     ADD CONSTRAINT recruiter_profiles_verified_by_fkey
     FOREIGN KEY (verified_by) REFERENCES auth.users(id) ON DELETE SET NULL'
);

-- Note: profiles.id == auth.users.id (1:1). Specialty profile tables FK to auth.users
-- only to avoid signup races before the profiles row is created by handle_new_user.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'institution_profiles'
  ) THEN
    PERFORM public._add_fk_if_missing(
      'public.institution_profiles',
      'institution_profiles_user_id_fkey',
      'ALTER TABLE public.institution_profiles
         ADD CONSTRAINT institution_profiles_user_id_fkey
         FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'
    );
  END IF;
END $$;

SELECT public._add_fk_if_missing(
  'public.student_activation_tokens',
  'student_activation_tokens_user_id_fkey',
  'ALTER TABLE public.student_activation_tokens
     ADD CONSTRAINT student_activation_tokens_user_id_fkey
     FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'
);

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'institution_profiles'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'student_activation_tokens'
  ) THEN
    PERFORM public._add_fk_if_missing(
      'public.student_activation_tokens',
      'student_activation_tokens_institution_id_fkey',
      'ALTER TABLE public.student_activation_tokens
         ADD CONSTRAINT student_activation_tokens_institution_id_fkey
         FOREIGN KEY (institution_id) REFERENCES public.institution_profiles(user_id) ON DELETE CASCADE'
    );
  END IF;
END $$;

SELECT public._add_fk_if_missing(
  'public.lms_connections',
  'lms_connections_user_id_fkey',
  'ALTER TABLE public.lms_connections
     ADD CONSTRAINT lms_connections_user_id_fkey
     FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'
);

SELECT public._add_fk_if_missing(
  'public.lms_evidence',
  'lms_evidence_user_id_fkey',
  'ALTER TABLE public.lms_evidence
     ADD CONSTRAINT lms_evidence_user_id_fkey
     FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'
);

-- =============================================================================
-- 2) Normalize linked_skill_id (text → uuid) + FK to declared_skills
-- ERD: GitHub activities / repos / LMS evidence link to Declared Skills
-- =============================================================================

DO $$
BEGIN
  -- github_activities.linked_skill_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'github_activities'
      AND column_name = 'linked_skill_id' AND data_type = 'text'
  ) THEN
    UPDATE public.github_activities
    SET linked_skill_id = NULL
    WHERE linked_skill_id IS NOT NULL AND NOT public._is_uuid_text(linked_skill_id);
    UPDATE public.github_activities ga
    SET linked_skill_id = NULL
    WHERE linked_skill_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.declared_skills ds WHERE ds.id::text = ga.linked_skill_id);
    ALTER TABLE public.github_activities
      ALTER COLUMN linked_skill_id TYPE uuid USING NULLIF(linked_skill_id, '')::uuid;
  END IF;

  -- github_repos.linked_skill_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'github_repos'
      AND column_name = 'linked_skill_id' AND data_type = 'text'
  ) THEN
    UPDATE public.github_repos
    SET linked_skill_id = NULL
    WHERE linked_skill_id IS NOT NULL AND NOT public._is_uuid_text(linked_skill_id);
    UPDATE public.github_repos gr
    SET linked_skill_id = NULL
    WHERE linked_skill_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.declared_skills ds WHERE ds.id::text = gr.linked_skill_id);
    ALTER TABLE public.github_repos
      ALTER COLUMN linked_skill_id TYPE uuid USING NULLIF(linked_skill_id, '')::uuid;
  END IF;

  -- lms_evidence.linked_skill_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lms_evidence'
      AND column_name = 'linked_skill_id' AND data_type = 'text'
  ) THEN
    UPDATE public.lms_evidence
    SET linked_skill_id = NULL
    WHERE linked_skill_id IS NOT NULL AND NOT public._is_uuid_text(linked_skill_id);
    UPDATE public.lms_evidence le
    SET linked_skill_id = NULL
    WHERE linked_skill_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.declared_skills ds WHERE ds.id::text = le.linked_skill_id);
    ALTER TABLE public.lms_evidence
      ALTER COLUMN linked_skill_id TYPE uuid USING NULLIF(linked_skill_id, '')::uuid;
  END IF;
END $$;

SELECT public._add_fk_if_missing(
  'public.github_activities',
  'github_activities_linked_skill_id_fkey',
  'ALTER TABLE public.github_activities
     ADD CONSTRAINT github_activities_linked_skill_id_fkey
     FOREIGN KEY (linked_skill_id) REFERENCES public.declared_skills(id) ON DELETE SET NULL'
);

SELECT public._add_fk_if_missing(
  'public.github_repos',
  'github_repos_linked_skill_id_fkey',
  'ALTER TABLE public.github_repos
     ADD CONSTRAINT github_repos_linked_skill_id_fkey
     FOREIGN KEY (linked_skill_id) REFERENCES public.declared_skills(id) ON DELETE SET NULL'
);

SELECT public._add_fk_if_missing(
  'public.lms_evidence',
  'lms_evidence_linked_skill_id_fkey',
  'ALTER TABLE public.lms_evidence
     ADD CONSTRAINT lms_evidence_linked_skill_id_fkey
     FOREIGN KEY (linked_skill_id) REFERENCES public.declared_skills(id) ON DELETE SET NULL'
);

-- =============================================================================
-- 3) Skills / evidence / attempts / peer-review FKs missing from CSV
-- =============================================================================

SELECT public._add_fk_if_missing(
  'public.declared_skills',
  'declared_skills_user_id_fkey',
  'ALTER TABLE public.declared_skills
     ADD CONSTRAINT declared_skills_user_id_fkey
     FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'
);

SELECT public._add_fk_if_missing(
  'public.evidence_records',
  'evidence_records_user_id_fkey',
  'ALTER TABLE public.evidence_records
     ADD CONSTRAINT evidence_records_user_id_fkey
     FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'
);

SELECT public._add_fk_if_missing(
  'public.practical_attempts',
  'practical_attempts_user_id_fkey',
  'ALTER TABLE public.practical_attempts
     ADD CONSTRAINT practical_attempts_user_id_fkey
     FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'
);

SELECT public._add_fk_if_missing(
  'public.practical_attempts',
  'practical_attempts_skill_id_fkey',
  'ALTER TABLE public.practical_attempts
     ADD CONSTRAINT practical_attempts_skill_id_fkey
     FOREIGN KEY (skill_id) REFERENCES public.declared_skills(id) ON DELETE CASCADE'
);

SELECT public._add_fk_if_missing(
  'public.mcq_task_attempts',
  'mcq_task_attempts_learner_user_id_fkey',
  'ALTER TABLE public.mcq_task_attempts
     ADD CONSTRAINT mcq_task_attempts_learner_user_id_fkey
     FOREIGN KEY (learner_user_id) REFERENCES auth.users(id) ON DELETE CASCADE'
);

SELECT public._add_fk_if_missing(
  'public.mcq_task_attempts',
  'mcq_task_attempts_skill_id_fkey',
  'ALTER TABLE public.mcq_task_attempts
     ADD CONSTRAINT mcq_task_attempts_skill_id_fkey
     FOREIGN KEY (skill_id) REFERENCES public.declared_skills(id) ON DELETE CASCADE'
);

-- peer_reviews missing FKs (CSV only had evidence_record_id + review_request_id)
SELECT public._add_fk_if_missing(
  'public.peer_reviews',
  'peer_reviews_learner_user_id_fkey',
  'ALTER TABLE public.peer_reviews
     ADD CONSTRAINT peer_reviews_learner_user_id_fkey
     FOREIGN KEY (learner_user_id) REFERENCES auth.users(id) ON DELETE CASCADE'
);

SELECT public._add_fk_if_missing(
  'public.peer_reviews',
  'peer_reviews_user_id_fkey',
  'ALTER TABLE public.peer_reviews
     ADD CONSTRAINT peer_reviews_user_id_fkey
     FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'
);

SELECT public._add_fk_if_missing(
  'public.peer_reviews',
  'peer_reviews_reviewer_user_id_fkey',
  'ALTER TABLE public.peer_reviews
     ADD CONSTRAINT peer_reviews_reviewer_user_id_fkey
     FOREIGN KEY (reviewer_user_id) REFERENCES auth.users(id) ON DELETE SET NULL'
);

SELECT public._add_fk_if_missing(
  'public.peer_reviews',
  'peer_reviews_skill_id_fkey',
  'ALTER TABLE public.peer_reviews
     ADD CONSTRAINT peer_reviews_skill_id_fkey
     FOREIGN KEY (skill_id) REFERENCES public.declared_skills(id) ON DELETE SET NULL'
);

SELECT public._add_fk_if_missing(
  'public.peer_reviews',
  'peer_reviews_invitation_id_fkey',
  'ALTER TABLE public.peer_reviews
     ADD CONSTRAINT peer_reviews_invitation_id_fkey
     FOREIGN KEY (invitation_id) REFERENCES public.review_invitations(id) ON DELETE SET NULL'
);

-- review_invitations.skill_id + learner
SELECT public._add_fk_if_missing(
  'public.review_invitations',
  'review_invitations_learner_user_id_fkey',
  'ALTER TABLE public.review_invitations
     ADD CONSTRAINT review_invitations_learner_user_id_fkey
     FOREIGN KEY (learner_user_id) REFERENCES auth.users(id) ON DELETE CASCADE'
);

SELECT public._add_fk_if_missing(
  'public.review_invitations',
  'review_invitations_skill_id_fkey',
  'ALTER TABLE public.review_invitations
     ADD CONSTRAINT review_invitations_skill_id_fkey
     FOREIGN KEY (skill_id) REFERENCES public.declared_skills(id) ON DELETE SET NULL'
);

SELECT public._add_fk_if_missing(
  'public.peer_review_invites',
  'peer_review_invites_learner_user_id_fkey',
  'ALTER TABLE public.peer_review_invites
     ADD CONSTRAINT peer_review_invites_learner_user_id_fkey
     FOREIGN KEY (learner_user_id) REFERENCES auth.users(id) ON DELETE CASCADE'
);

SELECT public._add_fk_if_missing(
  'public.reviewer_contexts',
  'reviewer_contexts_user_id_fkey',
  'ALTER TABLE public.reviewer_contexts
     ADD CONSTRAINT reviewer_contexts_user_id_fkey
     FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'
);

SELECT public._add_fk_if_missing(
  'public.review_requests',
  'review_requests_learner_user_id_fkey',
  'ALTER TABLE public.review_requests
     ADD CONSTRAINT review_requests_learner_user_id_fkey
     FOREIGN KEY (learner_user_id) REFERENCES auth.users(id) ON DELETE CASCADE'
);

-- ERD: Peer Review validated by MCQ Task Attempt
ALTER TABLE public.peer_reviews
  ADD COLUMN IF NOT EXISTS mcq_task_attempt_id uuid;

SELECT public._add_fk_if_missing(
  'public.peer_reviews',
  'peer_reviews_mcq_task_attempt_id_fkey',
  'ALTER TABLE public.peer_reviews
     ADD CONSTRAINT peer_reviews_mcq_task_attempt_id_fkey
     FOREIGN KEY (mcq_task_attempt_id) REFERENCES public.mcq_task_attempts(id) ON DELETE SET NULL'
);

-- =============================================================================
-- 4) Skill Evidence Links (ERD junction hub)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.skill_evidence_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES public.declared_skills(id) ON DELETE CASCADE,
  evidence_record_id uuid REFERENCES public.evidence_records(id) ON DELETE CASCADE,
  mcq_task_attempt_id uuid REFERENCES public.mcq_task_attempts(id) ON DELETE SET NULL,
  practical_attempt_id uuid REFERENCES public.practical_attempts(id) ON DELETE SET NULL,
  review_request_id uuid REFERENCES public.review_requests(id) ON DELETE SET NULL,
  link_role text NOT NULL DEFAULT 'supports',
  linked_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT skill_evidence_links_has_target CHECK (
    evidence_record_id IS NOT NULL
    OR mcq_task_attempt_id IS NOT NULL
    OR practical_attempt_id IS NOT NULL
  )
);

-- Existing installs may already have the table without attempt columns
ALTER TABLE public.skill_evidence_links
  ADD COLUMN IF NOT EXISTS mcq_task_attempt_id uuid,
  ADD COLUMN IF NOT EXISTS practical_attempt_id uuid,
  ADD COLUMN IF NOT EXISTS review_request_id uuid,
  ADD COLUMN IF NOT EXISTS link_role text NOT NULL DEFAULT 'supports';

-- Allow evidence_record_id to be nullable when linking attempts only
DO $$
BEGIN
  ALTER TABLE public.skill_evidence_links
    ALTER COLUMN evidence_record_id DROP NOT NULL;
EXCEPTION
  WHEN undefined_column THEN NULL;
  WHEN others THEN NULL;
END $$;

SELECT public._add_fk_if_missing(
  'public.skill_evidence_links',
  'skill_evidence_links_mcq_task_attempt_id_fkey',
  'ALTER TABLE public.skill_evidence_links
     ADD CONSTRAINT skill_evidence_links_mcq_task_attempt_id_fkey
     FOREIGN KEY (mcq_task_attempt_id) REFERENCES public.mcq_task_attempts(id) ON DELETE SET NULL'
);

SELECT public._add_fk_if_missing(
  'public.skill_evidence_links',
  'skill_evidence_links_practical_attempt_id_fkey',
  'ALTER TABLE public.skill_evidence_links
     ADD CONSTRAINT skill_evidence_links_practical_attempt_id_fkey
     FOREIGN KEY (practical_attempt_id) REFERENCES public.practical_attempts(id) ON DELETE SET NULL'
);

SELECT public._add_fk_if_missing(
  'public.skill_evidence_links',
  'skill_evidence_links_review_request_id_fkey',
  'ALTER TABLE public.skill_evidence_links
     ADD CONSTRAINT skill_evidence_links_review_request_id_fkey
     FOREIGN KEY (review_request_id) REFERENCES public.review_requests(id) ON DELETE SET NULL'
);

CREATE UNIQUE INDEX IF NOT EXISTS skill_evidence_links_skill_evidence_uidx
  ON public.skill_evidence_links (skill_id, evidence_record_id)
  WHERE evidence_record_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS skill_evidence_links_skill_mcq_uidx
  ON public.skill_evidence_links (skill_id, mcq_task_attempt_id)
  WHERE mcq_task_attempt_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS skill_evidence_links_skill_practical_uidx
  ON public.skill_evidence_links (skill_id, practical_attempt_id)
  WHERE practical_attempt_id IS NOT NULL;

ALTER TABLE public.skill_evidence_links ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "skill_evidence_links_select_own" ON public.skill_evidence_links
    FOR SELECT TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "skill_evidence_links_insert_own" ON public.skill_evidence_links
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "skill_evidence_links_delete_own" ON public.skill_evidence_links
    FOR DELETE TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- =============================================================================
-- 5) GitHub integration relationships
-- =============================================================================

SELECT public._add_fk_if_missing(
  'public.github_connections',
  'github_connections_user_id_fkey',
  'ALTER TABLE public.github_connections
     ADD CONSTRAINT github_connections_user_id_fkey
     FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'
);

SELECT public._add_fk_if_missing(
  'public.github_activities',
  'github_activities_user_id_fkey',
  'ALTER TABLE public.github_activities
     ADD CONSTRAINT github_activities_user_id_fkey
     FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'
);

SELECT public._add_fk_if_missing(
  'public.github_repos',
  'github_repos_user_id_fkey',
  'ALTER TABLE public.github_repos
     ADD CONSTRAINT github_repos_user_id_fkey
     FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'
);

SELECT public._add_fk_if_missing(
  'public.github_repo_contributors',
  'github_repo_contributors_user_id_fkey',
  'ALTER TABLE public.github_repo_contributors
     ADD CONSTRAINT github_repo_contributors_user_id_fkey
     FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'
);

SELECT public._add_fk_if_missing(
  'public.github_sync_logs',
  'github_sync_logs_user_id_fkey',
  'ALTER TABLE public.github_sync_logs
     ADD CONSTRAINT github_sync_logs_user_id_fkey
     FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'
);

-- Explicit connection FKs (ERD: Connection produces logs / syncs repos / has attempts)
ALTER TABLE public.github_sync_logs
  ADD COLUMN IF NOT EXISTS github_connection_user_id uuid;

UPDATE public.github_sync_logs
SET github_connection_user_id = user_id
WHERE github_connection_user_id IS NULL;

SELECT public._add_fk_if_missing(
  'public.github_sync_logs',
  'github_sync_logs_github_connection_user_id_fkey',
  'ALTER TABLE public.github_sync_logs
     ADD CONSTRAINT github_sync_logs_github_connection_user_id_fkey
     FOREIGN KEY (github_connection_user_id) REFERENCES public.github_connections(user_id) ON DELETE SET NULL'
);

ALTER TABLE public.github_repos
  ADD COLUMN IF NOT EXISTS github_connection_user_id uuid;

UPDATE public.github_repos
SET github_connection_user_id = user_id
WHERE github_connection_user_id IS NULL;

SELECT public._add_fk_if_missing(
  'public.github_repos',
  'github_repos_github_connection_user_id_fkey',
  'ALTER TABLE public.github_repos
     ADD CONSTRAINT github_repos_github_connection_user_id_fkey
     FOREIGN KEY (github_connection_user_id) REFERENCES public.github_connections(user_id) ON DELETE SET NULL'
);

-- Link contributors + activities to github_repos.id (ERD: repo has contributors/activities)
ALTER TABLE public.github_repo_contributors
  ADD COLUMN IF NOT EXISTS github_repo_uuid uuid;

ALTER TABLE public.github_activities
  ADD COLUMN IF NOT EXISTS github_repo_uuid uuid;

UPDATE public.github_repo_contributors c
SET github_repo_uuid = r.id
FROM public.github_repos r
WHERE c.github_repo_uuid IS NULL
  AND c.user_id = r.user_id
  AND c.repo_id = r.repo_id;

SELECT public._add_fk_if_missing(
  'public.github_repo_contributors',
  'github_repo_contributors_github_repo_uuid_fkey',
  'ALTER TABLE public.github_repo_contributors
     ADD CONSTRAINT github_repo_contributors_github_repo_uuid_fkey
     FOREIGN KEY (github_repo_uuid) REFERENCES public.github_repos(id) ON DELETE CASCADE'
);

SELECT public._add_fk_if_missing(
  'public.github_activities',
  'github_activities_github_repo_uuid_fkey',
  'ALTER TABLE public.github_activities
     ADD CONSTRAINT github_activities_github_repo_uuid_fkey
     FOREIGN KEY (github_repo_uuid) REFERENCES public.github_repos(id) ON DELETE SET NULL'
);

-- Evidence generated from sync log + optional github_repos.id link
ALTER TABLE public.evidence_records
  ADD COLUMN IF NOT EXISTS sync_log_id uuid,
  ADD COLUMN IF NOT EXISTS github_repo_uuid uuid,
  ADD COLUMN IF NOT EXISTS lms_evidence_id uuid;

SELECT public._add_fk_if_missing(
  'public.evidence_records',
  'evidence_records_sync_log_id_fkey',
  'ALTER TABLE public.evidence_records
     ADD CONSTRAINT evidence_records_sync_log_id_fkey
     FOREIGN KEY (sync_log_id) REFERENCES public.github_sync_logs(id) ON DELETE SET NULL'
);

-- Backfill github_repo_uuid from numeric github_repo_id when possible
UPDATE public.evidence_records er
SET github_repo_uuid = r.id
FROM public.github_repos r
WHERE er.github_repo_uuid IS NULL
  AND er.github_repo_id IS NOT NULL
  AND er.user_id = r.user_id
  AND er.github_repo_id = r.repo_id;

SELECT public._add_fk_if_missing(
  'public.evidence_records',
  'evidence_records_github_repo_uuid_fkey',
  'ALTER TABLE public.evidence_records
     ADD CONSTRAINT evidence_records_github_repo_uuid_fkey
     FOREIGN KEY (github_repo_uuid) REFERENCES public.github_repos(id) ON DELETE SET NULL'
);

SELECT public._add_fk_if_missing(
  'public.evidence_records',
  'evidence_records_lms_evidence_id_fkey',
  'ALTER TABLE public.evidence_records
     ADD CONSTRAINT evidence_records_lms_evidence_id_fkey
     FOREIGN KEY (lms_evidence_id) REFERENCES public.lms_evidence(id) ON DELETE SET NULL'
);

ALTER TABLE public.practical_attempts
  ADD COLUMN IF NOT EXISTS github_connection_user_id uuid;

ALTER TABLE public.mcq_task_attempts
  ADD COLUMN IF NOT EXISTS github_connection_user_id uuid;

SELECT public._add_fk_if_missing(
  'public.practical_attempts',
  'practical_attempts_github_connection_user_id_fkey',
  'ALTER TABLE public.practical_attempts
     ADD CONSTRAINT practical_attempts_github_connection_user_id_fkey
     FOREIGN KEY (github_connection_user_id) REFERENCES public.github_connections(user_id) ON DELETE SET NULL'
);

SELECT public._add_fk_if_missing(
  'public.mcq_task_attempts',
  'mcq_task_attempts_github_connection_user_id_fkey',
  'ALTER TABLE public.mcq_task_attempts
     ADD CONSTRAINT mcq_task_attempts_github_connection_user_id_fkey
     FOREIGN KEY (github_connection_user_id) REFERENCES public.github_connections(user_id) ON DELETE SET NULL'
);

-- =============================================================================
-- 6) Moodle / LMS hierarchy FKs (ERD: connection → courses → assignments → feedback/evidence)
-- =============================================================================

ALTER TABLE public.moodle_courses
  ADD COLUMN IF NOT EXISTS lms_connection_id uuid;

UPDATE public.moodle_courses mc
SET lms_connection_id = lc.id
FROM public.lms_connections lc
WHERE mc.lms_connection_id IS NULL
  AND mc.user_id = lc.user_id;

SELECT public._add_fk_if_missing(
  'public.moodle_courses',
  'moodle_courses_lms_connection_id_fkey',
  'ALTER TABLE public.moodle_courses
     ADD CONSTRAINT moodle_courses_lms_connection_id_fkey
     FOREIGN KEY (lms_connection_id) REFERENCES public.lms_connections(id) ON DELETE SET NULL'
);

ALTER TABLE public.moodle_assignments
  ADD COLUMN IF NOT EXISTS course_id uuid;

UPDATE public.moodle_assignments ma
SET course_id = mc.id
FROM public.moodle_courses mc
WHERE ma.course_id IS NULL
  AND ma.user_id = mc.user_id
  AND ma.moodle_course_id = mc.moodle_course_id;

SELECT public._add_fk_if_missing(
  'public.moodle_assignments',
  'moodle_assignments_course_id_fkey',
  'ALTER TABLE public.moodle_assignments
     ADD CONSTRAINT moodle_assignments_course_id_fkey
     FOREIGN KEY (course_id) REFERENCES public.moodle_courses(id) ON DELETE CASCADE'
);

ALTER TABLE public.moodle_feedback
  ADD COLUMN IF NOT EXISTS assignment_id uuid;

UPDATE public.moodle_feedback mf
SET assignment_id = ma.id
FROM public.moodle_assignments ma
WHERE mf.assignment_id IS NULL
  AND mf.user_id = ma.user_id
  AND mf.moodle_assignment_id = ma.moodle_assignment_id;

SELECT public._add_fk_if_missing(
  'public.moodle_feedback',
  'moodle_feedback_assignment_id_fkey',
  'ALTER TABLE public.moodle_feedback
     ADD CONSTRAINT moodle_feedback_assignment_id_fkey
     FOREIGN KEY (assignment_id) REFERENCES public.moodle_assignments(id) ON DELETE CASCADE'
);

ALTER TABLE public.lms_evidence
  ADD COLUMN IF NOT EXISTS moodle_assignment_id_uuid uuid,
  ADD COLUMN IF NOT EXISTS evidence_record_id uuid;

UPDATE public.lms_evidence le
SET moodle_assignment_id_uuid = ma.id
FROM public.moodle_assignments ma
WHERE le.moodle_assignment_id_uuid IS NULL
  AND le.user_id = ma.user_id
  AND le.raw ? 'moodle_assignment_id'
  AND (le.raw->>'moodle_assignment_id')::bigint = ma.moodle_assignment_id;

SELECT public._add_fk_if_missing(
  'public.lms_evidence',
  'lms_evidence_moodle_assignment_id_uuid_fkey',
  'ALTER TABLE public.lms_evidence
     ADD CONSTRAINT lms_evidence_moodle_assignment_id_uuid_fkey
     FOREIGN KEY (moodle_assignment_id_uuid) REFERENCES public.moodle_assignments(id) ON DELETE SET NULL'
);

SELECT public._add_fk_if_missing(
  'public.lms_evidence',
  'lms_evidence_evidence_record_id_fkey',
  'ALTER TABLE public.lms_evidence
     ADD CONSTRAINT lms_evidence_evidence_record_id_fkey
     FOREIGN KEY (evidence_record_id) REFERENCES public.evidence_records(id) ON DELETE SET NULL'
);

-- =============================================================================
-- 7) Decentralized identity + credential share / verification (ERD)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.decentralized_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_user_id uuid NOT NULL UNIQUE REFERENCES public.learner_profiles(user_id) ON DELETE CASCADE,
  did text NOT NULL UNIQUE,
  controller text,
  did_document jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Backfill DIDs from learner_profiles.holder_did when present
INSERT INTO public.decentralized_identities (learner_user_id, did)
SELECT lp.user_id, lp.holder_did
FROM public.learner_profiles lp
WHERE lp.holder_did IS NOT NULL
  AND btrim(lp.holder_did) <> ''
ON CONFLICT (learner_user_id) DO NOTHING;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'credentials'
  ) THEN
    ALTER TABLE public.credentials
      ADD COLUMN IF NOT EXISTS skill_id uuid,
      ADD COLUMN IF NOT EXISTS decentralized_identity_id uuid,
      ADD COLUMN IF NOT EXISTS evidence_record_id uuid;
  END IF;
END $$;

SELECT public._add_fk_if_missing(
  'public.credentials',
  'credentials_skill_id_fkey',
  'ALTER TABLE public.credentials
     ADD CONSTRAINT credentials_skill_id_fkey
     FOREIGN KEY (skill_id) REFERENCES public.declared_skills(id) ON DELETE SET NULL'
);

SELECT public._add_fk_if_missing(
  'public.credentials',
  'credentials_decentralized_identity_id_fkey',
  'ALTER TABLE public.credentials
     ADD CONSTRAINT credentials_decentralized_identity_id_fkey
     FOREIGN KEY (decentralized_identity_id) REFERENCES public.decentralized_identities(id) ON DELETE SET NULL'
);

SELECT public._add_fk_if_missing(
  'public.credentials',
  'credentials_evidence_record_id_fkey',
  'ALTER TABLE public.credentials
     ADD CONSTRAINT credentials_evidence_record_id_fkey
     FOREIGN KEY (evidence_record_id) REFERENCES public.evidence_records(id) ON DELETE SET NULL'
);

-- Credential Shares (ERD) — reusable share packages for recruiters
CREATE TABLE IF NOT EXISTS public.credential_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  credential_id uuid NOT NULL REFERENCES public.credentials(id) ON DELETE CASCADE,
  share_token_hash text NOT NULL UNIQUE,
  share_token_hint text,
  status text NOT NULL DEFAULT 'active',
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.disclosed_attributes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_share_id uuid NOT NULL REFERENCES public.credential_shares(id) ON DELETE CASCADE,
  attribute_key text NOT NULL,
  attribute_value jsonb,
  disclosed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (credential_share_id, attribute_key)
);

CREATE TABLE IF NOT EXISTS public.verification_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiter_user_id uuid NOT NULL REFERENCES public.recruiter_profiles(user_id) ON DELETE CASCADE,
  credential_share_id uuid NOT NULL REFERENCES public.credential_shares(id) ON DELETE CASCADE,
  learner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  purpose text,
  status text NOT NULL DEFAULT 'pending',
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.verification_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_request_id uuid NOT NULL REFERENCES public.verification_requests(id) ON DELETE CASCADE,
  result_status text NOT NULL DEFAULT 'unverified',
  proof_valid boolean,
  notes text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  verified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Link selective disclosure presentations to credential_shares when useful
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'selective_disclosure_presentations'
  ) THEN
    ALTER TABLE public.selective_disclosure_presentations
      ADD COLUMN IF NOT EXISTS credential_share_id uuid;
  END IF;
END $$;

SELECT public._add_fk_if_missing(
  'public.selective_disclosure_presentations',
  'selective_disclosure_presentations_credential_share_id_fkey',
  'ALTER TABLE public.selective_disclosure_presentations
     ADD CONSTRAINT selective_disclosure_presentations_credential_share_id_fkey
     FOREIGN KEY (credential_share_id) REFERENCES public.credential_shares(id) ON DELETE SET NULL'
);

-- =============================================================================
-- 8) Audit logs + notifications (ERD)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reviewer_context_id uuid REFERENCES public.reviewer_contexts(id) ON DELETE SET NULL,
  review_request_id uuid REFERENCES public.review_requests(id) ON DELETE SET NULL,
  peer_review_invite_id uuid REFERENCES public.peer_review_invites(id) ON DELETE SET NULL,
  title text NOT NULL,
  body text,
  channel text NOT NULL DEFAULT 'in_app',
  status text NOT NULL DEFAULT 'unread',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

CREATE INDEX IF NOT EXISTS audit_logs_profile_created_idx
  ON public.audit_logs (profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_recipient_status_idx
  ON public.notifications (recipient_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS verification_requests_recruiter_idx
  ON public.verification_requests (recruiter_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS credential_shares_profile_idx
  ON public.credential_shares (profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS evidence_records_github_repo_uuid_idx
  ON public.evidence_records (github_repo_uuid);
CREATE INDEX IF NOT EXISTS moodle_assignments_course_id_idx
  ON public.moodle_assignments (course_id);

-- RLS for new tables
ALTER TABLE public.decentralized_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credential_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disclosed_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "did_select_own" ON public.decentralized_identities
    FOR SELECT TO authenticated USING (auth.uid() = learner_user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "did_insert_own" ON public.decentralized_identities
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = learner_user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "did_update_own" ON public.decentralized_identities
    FOR UPDATE TO authenticated USING (auth.uid() = learner_user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "credential_shares_select_own" ON public.credential_shares
    FOR SELECT TO authenticated USING (auth.uid() = profile_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "credential_shares_insert_own" ON public.credential_shares
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = profile_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "credential_shares_update_own" ON public.credential_shares
    FOR UPDATE TO authenticated USING (auth.uid() = profile_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "credential_shares_select_recruiter" ON public.credential_shares
    FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'recruiter'));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "disclosed_attributes_select_via_share" ON public.disclosed_attributes
    FOR SELECT TO authenticated USING (
      EXISTS (
        SELECT 1 FROM public.credential_shares cs
        WHERE cs.id = credential_share_id
          AND (cs.profile_id = auth.uid() OR public.has_role(auth.uid(), 'recruiter'))
      )
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "disclosed_attributes_insert_own" ON public.disclosed_attributes
    FOR INSERT TO authenticated WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.credential_shares cs
        WHERE cs.id = credential_share_id AND cs.profile_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "verification_requests_select_recruiter" ON public.verification_requests
    FOR SELECT TO authenticated USING (auth.uid() = recruiter_user_id OR auth.uid() = learner_user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "verification_requests_insert_recruiter" ON public.verification_requests
    FOR INSERT TO authenticated WITH CHECK (
      auth.uid() = recruiter_user_id AND public.has_role(auth.uid(), 'recruiter')
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "verification_requests_update_parties" ON public.verification_requests
    FOR UPDATE TO authenticated USING (auth.uid() = recruiter_user_id OR auth.uid() = learner_user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "verification_results_select_parties" ON public.verification_results
    FOR SELECT TO authenticated USING (
      EXISTS (
        SELECT 1 FROM public.verification_requests vr
        WHERE vr.id = verification_request_id
          AND (vr.recruiter_user_id = auth.uid() OR vr.learner_user_id = auth.uid())
      )
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "verification_results_insert_recruiter" ON public.verification_results
    FOR INSERT TO authenticated WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.verification_requests vr
        WHERE vr.id = verification_request_id AND vr.recruiter_user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "audit_logs_select_own" ON public.audit_logs
    FOR SELECT TO authenticated USING (auth.uid() = profile_id OR auth.uid() = actor_user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "audit_logs_insert_authenticated" ON public.audit_logs
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = actor_user_id OR actor_user_id IS NULL);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "notifications_select_own" ON public.notifications
    FOR SELECT TO authenticated USING (auth.uid() = recipient_user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "notifications_update_own" ON public.notifications
    FOR UPDATE TO authenticated USING (auth.uid() = recipient_user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "notifications_insert_authenticated" ON public.notifications
    FOR INSERT TO authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- updated_at triggers where applicable
DO $$ BEGIN
  CREATE TRIGGER trg_decentralized_identities_updated_at
    BEFORE UPDATE ON public.decentralized_identities
    FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_credential_shares_updated_at
    BEFORE UPDATE ON public.credential_shares
    FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_verification_requests_updated_at
    BEFORE UPDATE ON public.verification_requests
    FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Cleanup helpers (keep _is_uuid_text optional; drop add-fk helper to avoid clutter)
DROP FUNCTION IF EXISTS public._add_fk_if_missing(text, text, text);
DROP FUNCTION IF EXISTS public._is_uuid_text(text);
