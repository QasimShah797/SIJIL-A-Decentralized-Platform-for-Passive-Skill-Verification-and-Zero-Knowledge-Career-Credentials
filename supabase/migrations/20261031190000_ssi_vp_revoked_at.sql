-- Additive: learner-controlled revocation marker for durable SSI VPs.
-- LOCAL FILE ONLY until explicitly approved for live apply.
-- Does not alter credentials, DIDs, challenges, or existing VP rows beyond adding a nullable column.
-- Existing rows remain active (revoked_at IS NULL).

BEGIN;

ALTER TABLE public.ssi_verifiable_presentations
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

COMMENT ON COLUMN public.ssi_verifiable_presentations.revoked_at IS
  'Set when the owning learner revokes the presentation verify link. Null means active.';

CREATE INDEX IF NOT EXISTS ssi_verifiable_presentations_active_idx
  ON public.ssi_verifiable_presentations (learner_user_id, created_at DESC)
  WHERE revoked_at IS NULL;

-- RLS and grants are unchanged: service_role only; no client write path.

COMMIT;
