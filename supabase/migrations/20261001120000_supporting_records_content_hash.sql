-- SHA-256 of uploaded evidence bytes, or of canonical metadata for links/GitHub.
-- Idempotent. Does not edit prior migrations.

DO $$
BEGIN
  IF to_regclass('public.supporting_records') IS NULL THEN
    RAISE EXCEPTION 'public.supporting_records does not exist.';
  END IF;
END $$;

ALTER TABLE public.supporting_records
  ADD COLUMN IF NOT EXISTS content_hash text;

COMMENT ON COLUMN public.supporting_records.content_hash IS
  'SHA-256 hex of uploaded file bytes, or of RFC 8785 canonical metadata for links/GitHub records';
