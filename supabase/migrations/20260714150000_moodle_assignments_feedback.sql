-- Denormalized teacher feedback on moodle_assignments for LMS UI display.
-- Idempotent — safe to run in Supabase SQL Editor.

ALTER TABLE public.moodle_assignments
  ADD COLUMN IF NOT EXISTS feedback text;

COMMENT ON COLUMN public.moodle_assignments.feedback IS
  'Teacher feedback text synced from mod_assign_get_submission_status (also stored in moodle_feedback).';
