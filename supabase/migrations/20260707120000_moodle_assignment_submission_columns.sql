-- Store student submission separately from teacher feedback on Moodle assignments.

ALTER TABLE public.moodle_assignments
  ADD COLUMN IF NOT EXISTS submission_text text,
  ADD COLUMN IF NOT EXISTS submission_files jsonb;

NOTIFY pgrst, 'reload schema';
