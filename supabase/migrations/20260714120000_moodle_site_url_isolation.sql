-- Moodle site URL isolation: tag all learner Moodle records with their source site
-- so stale data from a previous Moodle instance can be safely removed per learner.

ALTER TABLE public.lms_connections
  ADD COLUMN IF NOT EXISTS moodle_site_url text;

ALTER TABLE public.moodle_courses
  ADD COLUMN IF NOT EXISTS moodle_site_url text;

ALTER TABLE public.moodle_assignments
  ADD COLUMN IF NOT EXISTS moodle_site_url text;

ALTER TABLE public.moodle_feedback
  ADD COLUMN IF NOT EXISTS moodle_site_url text;

ALTER TABLE public.moodle_grades
  ADD COLUMN IF NOT EXISTS moodle_site_url text;

ALTER TABLE public.lms_evidence
  ADD COLUMN IF NOT EXISTS moodle_site_url text;

ALTER TABLE public.imported_lms_evidence
  ADD COLUMN IF NOT EXISTS moodle_site_url text;

COMMENT ON COLUMN public.lms_connections.moodle_site_url IS 'Normalized Moodle site URL for the active connection';

CREATE INDEX IF NOT EXISTS moodle_courses_user_site_idx
  ON public.moodle_courses (user_id, moodle_site_url, synced_at DESC);

CREATE INDEX IF NOT EXISTS moodle_assignments_user_site_idx
  ON public.moodle_assignments (user_id, moodle_site_url, moodle_course_id);

CREATE INDEX IF NOT EXISTS moodle_feedback_user_site_idx
  ON public.moodle_feedback (user_id, moodle_site_url);

CREATE INDEX IF NOT EXISTS lms_evidence_user_moodle_site_idx
  ON public.lms_evidence (user_id, moodle_site_url)
  WHERE source ILIKE '%moodle%' OR source ILIKE '%lms%';

NOTIFY pgrst, 'reload schema';
