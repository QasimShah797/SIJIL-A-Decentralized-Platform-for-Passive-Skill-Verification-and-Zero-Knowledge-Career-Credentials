-- Phase 3 SSI: one-time learner presentation challenges.
-- Do not apply from an agent session against the live project unless a lead reviews it.
-- Private keys are never stored. Express service-role writes; recruiters/learners do not INSERT.

CREATE TABLE IF NOT EXISTS public.ssi_presentation_challenges (
  id uuid PRIMARY KEY,
  learner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  holder_did text NOT NULL,
  audience text NOT NULL,
  nonce text NOT NULL UNIQUE,
  credential_ids jsonb NOT NULL,
  credential_hashes jsonb NOT NULL,
  claims jsonb NOT NULL,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ssi_presentation_challenges_did_format_chk CHECK (
    holder_did ~ '^did:key:z[1-9A-HJ-NP-Za-km-z]{45,80}$'
  ),
  CONSTRAINT ssi_presentation_challenges_audience_chk CHECK (
    char_length(audience) BETWEEN 1 AND 256
  )
);

CREATE TABLE IF NOT EXISTS public.ssi_verifiable_presentations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid NOT NULL UNIQUE REFERENCES public.ssi_presentation_challenges(id),
  learner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  holder_did text NOT NULL,
  credential_ids jsonb NOT NULL,
  presentation_hash text NOT NULL,
  proof_value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ssi_presentation_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ssi_presentation_challenges FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ssi_verifiable_presentations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ssi_verifiable_presentations FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ssi_presentation_challenges FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ssi_verifiable_presentations FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.ssi_presentation_challenges TO service_role;
GRANT ALL ON TABLE public.ssi_verifiable_presentations TO service_role;

CREATE INDEX IF NOT EXISTS ssi_presentation_challenges_learner_idx
  ON public.ssi_presentation_challenges (learner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ssi_presentation_challenges_unused_idx
  ON public.ssi_presentation_challenges (expires_at)
  WHERE used_at IS NULL;

COMMENT ON TABLE public.ssi_presentation_challenges IS
  'One-time presentation challenges. Consume with UPDATE ... WHERE used_at IS NULL. Never stores private keys.';
COMMENT ON TABLE public.ssi_verifiable_presentations IS
  'Audit metadata for learner-signed presentations. Proof values are holder signatures, not private keys.';
