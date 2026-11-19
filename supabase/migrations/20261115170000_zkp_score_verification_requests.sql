-- Local migration for recruiter-selected score proof requests.
-- Do not apply this to hosted Supabase until it is explicitly approved.
-- Stores the Groth16 proof after acceptance. It does not store the score or blinding.

BEGIN;

CREATE TABLE IF NOT EXISTS public.zkp_score_verification_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiter_user_id uuid NOT NULL REFERENCES auth.users(id),
  learner_user_id uuid NOT NULL REFERENCES auth.users(id),
  credential_uri text NOT NULL,
  credential_id text NOT NULL,
  threshold integer NOT NULL CHECK (threshold >= 0 AND threshold <= 100),
  status text NOT NULL CHECK (status IN ('open', 'declined', 'consumed', 'expired')),
  audience text NOT NULL,
  share_token_hash text NOT NULL,
  proof jsonb,
  public_signals jsonb,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS zkp_score_verification_requests_learner_idx
  ON public.zkp_score_verification_requests (learner_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS zkp_score_verification_requests_recruiter_idx
  ON public.zkp_score_verification_requests (recruiter_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS zkp_score_verification_requests_credential_idx
  ON public.zkp_score_verification_requests (credential_uri, recruiter_user_id, status);

COMMENT ON TABLE public.zkp_score_verification_requests IS
  'Recruiter-selected score proof requests. Service role only. Does not store the score or blinding.';
COMMENT ON COLUMN public.zkp_score_verification_requests.proof IS
  'Groth16 proof JSON stored after acceptance. Must not contain the score or blinding.';
COMMENT ON COLUMN public.zkp_score_verification_requests.public_signals IS
  'Public threshold and commitment only. Must not contain the score or blinding.';
COMMENT ON COLUMN public.zkp_score_verification_requests.share_token_hash IS
  'SHA-256 of the share token. The raw token is not stored.';

ALTER TABLE public.zkp_score_verification_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS zkp_score_verification_requests_deny_client ON public.zkp_score_verification_requests;
CREATE POLICY zkp_score_verification_requests_deny_client
  ON public.zkp_score_verification_requests
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON public.zkp_score_verification_requests FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.zkp_score_verification_requests TO service_role;

COMMIT;
