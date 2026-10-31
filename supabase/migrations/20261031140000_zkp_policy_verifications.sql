-- SIJIL automated ZKP policy verification outcomes.
-- LOCAL FILE ONLY until explicitly approved for live apply.
-- Does not modify existing GitHub ZKP tables or assessment openings.
-- Stores MEETS_THRESHOLD / BELOW_THRESHOLD outcomes backed by Groth16 proofs.

BEGIN;

CREATE TABLE IF NOT EXISTS public.zkp_policy_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_user_id uuid NOT NULL REFERENCES auth.users(id),
  zkp_type text NOT NULL CHECK (zkp_type IN ('score-threshold-v1', 'github-contributions-v1')),
  policy_version text NOT NULL,
  threshold integer NOT NULL CHECK (threshold >= 0),
  outcome text NOT NULL CHECK (outcome IN (
    'PENDING',
    'MEETS_THRESHOLD',
    'BELOW_THRESHOLD',
    'ERROR',
    'NOT_VERIFIED'
  )),
  circuit_variant text CHECK (circuit_variant IS NULL OR circuit_variant IN ('meets', 'below')),
  evidence_ref text NOT NULL,
  evidence_scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_fresh_at timestamptz,
  public_signals jsonb,
  proof jsonb,
  disclosure_token_hash text,
  disclosure_expires_at timestamptz,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT zkp_policy_verifications_unique_evidence
    UNIQUE (learner_user_id, zkp_type, policy_version, evidence_ref)
);

CREATE INDEX IF NOT EXISTS zkp_policy_verifications_learner_idx
  ON public.zkp_policy_verifications (learner_user_id, zkp_type, updated_at DESC);

CREATE INDEX IF NOT EXISTS zkp_policy_verifications_pending_idx
  ON public.zkp_policy_verifications (outcome, updated_at)
  WHERE outcome IN ('PENDING', 'ERROR');

ALTER TABLE public.zkp_policy_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY zkp_policy_verifications_deny_client
  ON public.zkp_policy_verifications
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON public.zkp_policy_verifications FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.zkp_policy_verifications TO service_role;

CREATE OR REPLACE FUNCTION public.upsert_zkp_policy_verification(
  p_learner_user_id uuid,
  p_zkp_type text,
  p_policy_version text,
  p_threshold integer,
  p_outcome text,
  p_circuit_variant text,
  p_evidence_ref text,
  p_evidence_scope jsonb,
  p_evidence_fresh_at timestamptz,
  p_public_signals jsonb,
  p_proof jsonb,
  p_disclosure_token_hash text,
  p_disclosure_expires_at timestamptz,
  p_error_code text,
  p_error_message text
)
RETURNS public.zkp_policy_verifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row public.zkp_policy_verifications;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role required';
  END IF;

  INSERT INTO public.zkp_policy_verifications AS t (
    learner_user_id,
    zkp_type,
    policy_version,
    threshold,
    outcome,
    circuit_variant,
    evidence_ref,
    evidence_scope,
    evidence_fresh_at,
    public_signals,
    proof,
    disclosure_token_hash,
    disclosure_expires_at,
    error_code,
    error_message,
    updated_at
  ) VALUES (
    p_learner_user_id,
    p_zkp_type,
    p_policy_version,
    p_threshold,
    p_outcome,
    p_circuit_variant,
    p_evidence_ref,
    COALESCE(p_evidence_scope, '{}'::jsonb),
    p_evidence_fresh_at,
    p_public_signals,
    p_proof,
    p_disclosure_token_hash,
    p_disclosure_expires_at,
    p_error_code,
    p_error_message,
    now()
  )
  ON CONFLICT (learner_user_id, zkp_type, policy_version, evidence_ref)
  DO UPDATE SET
    threshold = EXCLUDED.threshold,
    outcome = EXCLUDED.outcome,
    circuit_variant = EXCLUDED.circuit_variant,
    evidence_scope = EXCLUDED.evidence_scope,
    evidence_fresh_at = EXCLUDED.evidence_fresh_at,
    public_signals = EXCLUDED.public_signals,
    proof = EXCLUDED.proof,
    disclosure_token_hash = EXCLUDED.disclosure_token_hash,
    disclosure_expires_at = EXCLUDED.disclosure_expires_at,
    error_code = EXCLUDED.error_code,
    error_message = EXCLUDED.error_message,
    updated_at = now()
  RETURNING * INTO row;

  RETURN row;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_zkp_policy_verification(
  uuid, text, text, integer, text, text, text, jsonb, timestamptz, jsonb, jsonb, text, timestamptz, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_zkp_policy_verification(
  uuid, text, text, integer, text, text, text, jsonb, timestamptz, jsonb, jsonb, text, timestamptz, text, text
) TO service_role;

COMMIT;
