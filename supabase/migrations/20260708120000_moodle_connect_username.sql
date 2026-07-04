-- Moodle connect flow: username display + one Moodle account per SIJIL user link.

ALTER TABLE public.lms_connections
  ADD COLUMN IF NOT EXISTS moodle_username text;

CREATE UNIQUE INDEX IF NOT EXISTS lms_connections_moodle_user_id_unique
  ON public.lms_connections (moodle_user_id)
  WHERE moodle_user_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
