-- Durable audit history for administrator-approved Fabric re-anchoring.
-- LOCAL FILE ONLY until explicitly approved for live apply.
-- Additive: no existing credential, hash, issuance date, or revocation field is modified.
-- Used only by the admin reconciliation path; the worker never writes this table.

BEGIN;

CREATE TABLE IF NOT EXISTS public.credential_anchor_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id uuid NOT NULL REFERENCES public.credentials(id),
  outcome text NOT NULL CHECK (outcome IN (
    'already_on_ledger',
    'refused_conflicting_hash',
    'refused_revoked',
    'refused_hash_confirmation',
    'refused_not_anchored',
    'in_progress',
    'completed',
    'failed'
  )),
  reason text NOT NULL,
  requested_by uuid NOT NULL REFERENCES auth.users(id),
  expected_hash text,
  previous_anchor_tx_id text,
  previous_anchored_at timestamptz,
  new_anchor_tx_id text,
  ledger_exists boolean,
  ledger_hash_matches boolean,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS credential_anchor_reconciliations_credential_idx
  ON public.credential_anchor_reconciliations (credential_id, created_at DESC);

-- One in-flight reconciliation per credential.
CREATE UNIQUE INDEX IF NOT EXISTS credential_anchor_reconciliations_in_progress_idx
  ON public.credential_anchor_reconciliations (credential_id)
  WHERE outcome = 'in_progress';

ALTER TABLE public.credential_anchor_reconciliations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'credential_anchor_reconciliations'
      AND policyname = 'credential_anchor_reconciliations_deny_client'
  ) THEN
    CREATE POLICY credential_anchor_reconciliations_deny_client
      ON public.credential_anchor_reconciliations
      FOR ALL
      TO anon, authenticated
      USING (false)
      WITH CHECK (false);
  END IF;
END
$$;

REVOKE ALL ON public.credential_anchor_reconciliations FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.credential_anchor_reconciliations TO service_role;

COMMIT;
