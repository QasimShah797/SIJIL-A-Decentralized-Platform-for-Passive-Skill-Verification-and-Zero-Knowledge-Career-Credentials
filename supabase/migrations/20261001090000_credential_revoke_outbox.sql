-- Revocation outbox so Postgres always records revoke, then Fabric is retried.
-- Idempotent. Does not edit prior migrations.

DO $$
BEGIN
  IF to_regclass('public.credentials') IS NULL THEN
    RAISE EXCEPTION 'public.credentials does not exist.';
  END IF;
END $$;

ALTER TABLE public.credentials
  ADD COLUMN IF NOT EXISTS revoke_status text,
  ADD COLUMN IF NOT EXISTS revoke_attempts integer,
  ADD COLUMN IF NOT EXISTS revoke_last_error text,
  ADD COLUMN IF NOT EXISTS revoke_tx_id text;

UPDATE public.credentials
SET revoke_status = 'not_required'
WHERE revoke_status IS NULL;

UPDATE public.credentials
SET revoke_attempts = 0
WHERE revoke_attempts IS NULL;

ALTER TABLE public.credentials
  ALTER COLUMN revoke_status SET DEFAULT 'not_required';

ALTER TABLE public.credentials
  ALTER COLUMN revoke_attempts SET DEFAULT 0;

ALTER TABLE public.credentials
  ALTER COLUMN revoke_status SET NOT NULL;

ALTER TABLE public.credentials
  ALTER COLUMN revoke_attempts SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'credentials_revoke_status_check'
  ) THEN
    ALTER TABLE public.credentials DROP CONSTRAINT credentials_revoke_status_check;
  END IF;
END $$;

ALTER TABLE public.credentials
  ADD CONSTRAINT credentials_revoke_status_check
  CHECK (revoke_status IN ('not_required', 'pending', 'revoked', 'failed'));

CREATE INDEX IF NOT EXISTS credentials_revoke_outbox_idx
  ON public.credentials (created_at)
  WHERE revoke_status IN ('pending', 'failed');
