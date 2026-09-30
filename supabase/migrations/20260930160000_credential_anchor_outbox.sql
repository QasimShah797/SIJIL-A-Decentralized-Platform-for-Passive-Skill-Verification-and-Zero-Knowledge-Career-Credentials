-- Outbox retry columns for Fabric credential anchors.
-- Idempotent. Requires public.credentials.

DO $$
BEGIN
  IF to_regclass('public.credentials') IS NULL THEN
    RAISE EXCEPTION 'public.credentials does not exist. Apply earlier credentials migrations first.';
  END IF;
END $$;

ALTER TABLE public.credentials
  ADD COLUMN IF NOT EXISTS anchor_attempts integer,
  ADD COLUMN IF NOT EXISTS anchor_last_error text;

UPDATE public.credentials
SET anchor_attempts = 0
WHERE anchor_attempts IS NULL;

ALTER TABLE public.credentials
  ALTER COLUMN anchor_attempts SET DEFAULT 0;

ALTER TABLE public.credentials
  ALTER COLUMN anchor_attempts SET NOT NULL;

CREATE INDEX IF NOT EXISTS credentials_anchor_outbox_idx
  ON public.credentials (created_at)
  WHERE anchor_status IN ('pending', 'failed');
