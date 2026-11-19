-- Lease columns so more than one backend can claim an anchor or revocation
-- without submitting the same credential twice.
-- Existing rows stay ineligible for automatic submit: this file does not set
-- anchor timestamps or flip FABRIC_ENABLED. Apply on an isolated database first.
-- Do not run this against hosted Supabase until that apply is approved.

ALTER TABLE public.credentials
  ADD COLUMN IF NOT EXISTS anchor_claim_token uuid,
  ADD COLUMN IF NOT EXISTS anchor_claim_until timestamptz,
  ADD COLUMN IF NOT EXISTS revoke_claim_token uuid,
  ADD COLUMN IF NOT EXISTS revoke_claim_until timestamptz;

CREATE INDEX IF NOT EXISTS credentials_anchor_claim_idx
  ON public.credentials (anchor_claim_until)
  WHERE anchor_status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS credentials_revoke_claim_idx
  ON public.credentials (revoke_claim_until)
  WHERE revoke_status IN ('pending', 'failed');
