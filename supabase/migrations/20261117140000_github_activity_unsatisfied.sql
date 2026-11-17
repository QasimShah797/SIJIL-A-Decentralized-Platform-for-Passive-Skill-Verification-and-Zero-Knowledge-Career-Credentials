-- Additive status for a GitHub activity request whose trusted count is below
-- the recruiter threshold. This is not a Groth16 below-threshold proof.
-- Apply only after 20261115220000, and only with explicit approval.
-- Do not run this against hosted Supabase from the application.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.zkp_verification_requests') IS NULL THEN
    RAISE EXCEPTION 'zkp_verification_requests is not present. Apply 20261115220000 first.';
  END IF;

  ALTER TABLE public.zkp_verification_requests
    DROP CONSTRAINT IF EXISTS zkp_verification_requests_status_check;

  ALTER TABLE public.zkp_verification_requests
    ADD CONSTRAINT zkp_verification_requests_status_check
    CHECK (status IN (
      'pending',
      'approved',
      'generating',
      'verified',
      'failed',
      'unsatisfied',
      'rejected',
      'expired',
      'cancelled'
    ));
END $$;

COMMIT;
