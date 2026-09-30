-- Credential document hash, revocation, and ledger-anchor columns.
-- Idempotent. Requires public.credentials (see 20260930120000_lock_trust_bearing_writes.sql).

DO $$
BEGIN
  IF to_regclass('public.credentials') IS NULL THEN
    RAISE EXCEPTION 'public.credentials does not exist. Apply 20260930120000_lock_trust_bearing_writes.sql first.';
  END IF;
END $$;

ALTER TABLE public.credentials
  ADD COLUMN IF NOT EXISTS credential_document jsonb,
  ADD COLUMN IF NOT EXISTS credential_hash text,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS revocation_reason text,
  ADD COLUMN IF NOT EXISTS anchor_status text,
  ADD COLUMN IF NOT EXISTS anchor_tx_id text,
  ADD COLUMN IF NOT EXISTS anchored_at timestamptz;

UPDATE public.credentials
SET anchor_status = 'pending'
WHERE anchor_status IS NULL;

ALTER TABLE public.credentials
  ALTER COLUMN anchor_status SET DEFAULT 'pending';

ALTER TABLE public.credentials
  ALTER COLUMN anchor_status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'credentials_anchor_status_check'
  ) THEN
    ALTER TABLE public.credentials
      ADD CONSTRAINT credentials_anchor_status_check
      CHECK (anchor_status IN ('pending', 'anchored', 'failed', 'not_required'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS credentials_anchor_status_idx
  ON public.credentials (anchor_status);
