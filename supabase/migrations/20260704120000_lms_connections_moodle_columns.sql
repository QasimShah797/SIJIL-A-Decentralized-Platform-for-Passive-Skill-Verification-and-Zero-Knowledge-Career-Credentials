-- Store Moodle connection metadata in existing lms_connections (one row per user).

ALTER TABLE public.lms_connections
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS moodle_user_id bigint,
  ADD COLUMN IF NOT EXISTS moodle_email text,
  ADD COLUMN IF NOT EXISTS institution_email text;

COMMENT ON COLUMN public.lms_connections.provider IS 'LMS provider: moodle, odoo, etc.';
COMMENT ON COLUMN public.lms_connections.moodle_user_id IS 'Linked Moodle user ID when provider is moodle';

CREATE INDEX IF NOT EXISTS lms_connections_provider_idx
  ON public.lms_connections (user_id, provider)
  WHERE provider IS NOT NULL;

NOTIFY pgrst, 'reload schema';
