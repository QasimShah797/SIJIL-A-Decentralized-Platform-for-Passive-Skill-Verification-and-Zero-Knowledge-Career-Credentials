-- Phase 1 SSI: learner-controlled did:key bindings.
-- Fresh-database safe: creates only public.learner_ssi_identities (+ trigger/function).
-- Does not ALTER or rewrite public.credentials, learner_profiles, or holder_did.
-- DO NOT apply from an agent session against the live project unless a lead reviews it.
-- Writes are service-role only (Express BYPASSRLS). Learners may SELECT their own row.
-- Private keys are never stored.

CREATE TABLE IF NOT EXISTS public.learner_ssi_identities (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  did text NOT NULL UNIQUE,
  fingerprint text NOT NULL,
  public_key_multibase text NOT NULL,
  bound_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT learner_ssi_identities_did_format_chk CHECK (
    did ~ '^did:key:z[1-9A-HJ-NP-Za-km-z]{45,80}$'
  ),
  CONSTRAINT learner_ssi_identities_multibase_matches_did_chk CHECK (
    public_key_multibase = substr(did, 9)
    AND public_key_multibase ~ '^z[1-9A-HJ-NP-Za-km-z]{45,80}$'
  ),
  CONSTRAINT learner_ssi_identities_fingerprint_format_chk CHECK (
    fingerprint ~ '^[0-9a-f]{2}(:[0-9a-f]{2}){7}$'
  )
);

-- CREATE TABLE IF NOT EXISTS does not add missing CHECKs if a prior table exists.
-- No other SIJIL migration creates this relation; the DO blocks are re-run safe.
DO $$ BEGIN
  ALTER TABLE public.learner_ssi_identities
    ADD CONSTRAINT learner_ssi_identities_did_format_chk CHECK (
      did ~ '^did:key:z[1-9A-HJ-NP-Za-km-z]{45,80}$'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.learner_ssi_identities
    ADD CONSTRAINT learner_ssi_identities_multibase_matches_did_chk CHECK (
      public_key_multibase = substr(did, 9)
      AND public_key_multibase ~ '^z[1-9A-HJ-NP-Za-km-z]{45,80}$'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.learner_ssi_identities
    ADD CONSTRAINT learner_ssi_identities_fingerprint_format_chk CHECK (
      fingerprint ~ '^[0-9a-f]{2}(:[0-9a-f]{2}){7}$'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.learner_ssi_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learner_ssi_identities FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "learner_ssi_identities_select_own" ON public.learner_ssi_identities
    FOR SELECT TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

REVOKE ALL ON TABLE public.learner_ssi_identities FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.learner_ssi_identities TO authenticated;
GRANT ALL ON TABLE public.learner_ssi_identities TO service_role;

CREATE OR REPLACE FUNCTION public.prevent_ssi_identity_reassignment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'SSI identity user_id cannot be changed';
  END IF;
  IF NEW.did IS DISTINCT FROM OLD.did THEN
    RAISE EXCEPTION 'SSI DID cannot be reassigned';
  END IF;
  IF NEW.fingerprint IS DISTINCT FROM OLD.fingerprint THEN
    RAISE EXCEPTION 'SSI fingerprint cannot be changed';
  END IF;
  IF NEW.public_key_multibase IS DISTINCT FROM OLD.public_key_multibase THEN
    RAISE EXCEPTION 'SSI public_key_multibase cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_ssi_identity_reassignment ON public.learner_ssi_identities;
CREATE TRIGGER trg_prevent_ssi_identity_reassignment
  BEFORE UPDATE ON public.learner_ssi_identities
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_ssi_identity_reassignment();

REVOKE ALL ON FUNCTION public.prevent_ssi_identity_reassignment() FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.learner_ssi_identities IS
  'Learner Ed25519 did:key bindings proven by challenge-response. Stores only public DID metadata derived server-side from the same 32-byte public key. Private keys must never be written here. Does not modify credentials or learner_profiles.';
