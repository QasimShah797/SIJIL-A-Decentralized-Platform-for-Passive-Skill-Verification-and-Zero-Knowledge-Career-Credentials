-- Durable one-time challenges for learner SSI activation.
-- Local migration file only. Do not apply to the hosted project from an agent session.
-- Stores the signed challenge payload. Private keys are never written here.
-- Consume with UPDATE ... WHERE used_at IS NULL AND expires_at > now().

CREATE TABLE IF NOT EXISTS public.ssi_bind_challenges (
  id uuid PRIMARY KEY,
  learner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nonce text NOT NULL UNIQUE,
  purpose text NOT NULL,
  audience text NOT NULL,
  payload text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ssi_bind_challenges_purpose_chk CHECK (purpose = 'bind-learner-did'),
  CONSTRAINT ssi_bind_challenges_audience_chk CHECK (audience = 'sijil-express'),
  CONSTRAINT ssi_bind_challenges_nonce_len_chk CHECK (char_length(nonce) BETWEEN 43 AND 64),
  CONSTRAINT ssi_bind_challenges_payload_len_chk CHECK (char_length(payload) BETWEEN 1 AND 2048)
);

ALTER TABLE public.ssi_bind_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ssi_bind_challenges FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ssi_bind_challenges FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.ssi_bind_challenges TO service_role;

CREATE INDEX IF NOT EXISTS ssi_bind_challenges_learner_idx
  ON public.ssi_bind_challenges (learner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ssi_bind_challenges_unused_idx
  ON public.ssi_bind_challenges (expires_at)
  WHERE used_at IS NULL;

CREATE OR REPLACE FUNCTION public.prevent_ssi_bind_challenge_rewrite()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.learner_user_id IS DISTINCT FROM OLD.learner_user_id
    OR NEW.nonce IS DISTINCT FROM OLD.nonce
    OR NEW.purpose IS DISTINCT FROM OLD.purpose
    OR NEW.audience IS DISTINCT FROM OLD.audience
    OR NEW.payload IS DISTINCT FROM OLD.payload
    OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'SSI bind challenge fields are immutable';
  END IF;
  IF OLD.used_at IS NOT NULL AND NEW.used_at IS DISTINCT FROM OLD.used_at THEN
    RAISE EXCEPTION 'SSI bind challenge is already consumed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_ssi_bind_challenge_rewrite ON public.ssi_bind_challenges;
CREATE TRIGGER trg_prevent_ssi_bind_challenge_rewrite
  BEFORE UPDATE ON public.ssi_bind_challenges
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_ssi_bind_challenge_rewrite();

REVOKE ALL ON FUNCTION public.prevent_ssi_bind_challenge_rewrite() FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.ssi_bind_challenges IS
  'One-time learner SSI activation challenges. Service role only. Never stores private keys. Consume with a single UPDATE of an unused, unexpired row.';
