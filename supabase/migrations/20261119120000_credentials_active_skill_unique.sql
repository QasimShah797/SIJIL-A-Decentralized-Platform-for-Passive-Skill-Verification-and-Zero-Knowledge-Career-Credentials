-- Prevent concurrent duplicate issuance of the same active skill credential.
-- Revoked rows are excluded so legitimate re-issue after revoke remains possible.
-- Idempotent. Requires public.credentials.

DO $$
BEGIN
  IF to_regclass('public.credentials') IS NULL THEN
    RAISE EXCEPTION 'public.credentials does not exist.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS credentials_active_user_skill_once
  ON public.credentials (user_id, skill_name)
  WHERE revoked_at IS NULL
    AND skill_name IS NOT NULL
    AND btrim(skill_name) <> '';
