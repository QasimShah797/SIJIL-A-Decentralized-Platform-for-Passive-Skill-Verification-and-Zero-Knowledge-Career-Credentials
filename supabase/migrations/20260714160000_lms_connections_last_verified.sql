-- Track when SIJIL email ↔ Moodle user mapping was last verified.

ALTER TABLE public.lms_connections
  ADD COLUMN IF NOT EXISTS last_verified timestamptz;

COMMENT ON COLUMN public.lms_connections.last_verified IS
  'When Moodle user identity was last verified via core_user_get_users email lookup.';

NOTIFY pgrst, 'reload schema';
