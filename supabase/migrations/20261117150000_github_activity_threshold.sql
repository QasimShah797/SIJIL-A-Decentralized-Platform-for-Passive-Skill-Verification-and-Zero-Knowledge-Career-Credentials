-- Structured public threshold for GitHub activity requests.
-- Apply after 20261115220000. Do not apply this file to hosted Supabase
-- until it is explicitly approved. It does not delete rows or change proofs.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.zkp_verification_requests') IS NULL THEN
    RAISE EXCEPTION 'zkp_verification_requests is not present. Apply 20261115220000 first.';
  END IF;
END $$;

ALTER TABLE public.zkp_verification_requests
  ADD COLUMN IF NOT EXISTS threshold integer;

UPDATE public.zkp_verification_requests
SET threshold = (substring(policy_label FROM 'At least ([0-9]+)'))::integer
WHERE category = 'github-activity'
  AND threshold IS NULL
  AND policy_label ~ '^At least (50|100|150) unique commits';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.zkp_verification_requests
    WHERE category = 'github-activity'
      AND (threshold IS NULL OR threshold NOT IN (50, 100, 150))
  ) THEN
    RAISE EXCEPTION 'A GitHub activity request has no valid threshold. Fix that row before adding the check.';
  END IF;

  ALTER TABLE public.zkp_verification_requests
    DROP CONSTRAINT IF EXISTS zkp_verification_requests_github_threshold_check;

  ALTER TABLE public.zkp_verification_requests
    ADD CONSTRAINT zkp_verification_requests_github_threshold_check
    CHECK (
      category <> 'github-activity'
      OR threshold IN (50, 100, 150)
    );
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.zkp_verification_requests
    WHERE category = 'github-activity'
      AND status IN ('pending', 'approved', 'generating')
    GROUP BY recruiter_user_id, learner_user_id, threshold
    HAVING count(*) > 1
  ) THEN
    RAISE NOTICE 'Open GitHub requests are already duplicated, so the unique index was not created.';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS zkp_verification_requests_open_github_idx
      ON public.zkp_verification_requests (recruiter_user_id, learner_user_id, threshold)
      WHERE category = 'github-activity'
        AND status IN ('pending', 'approved', 'generating');
  END IF;
END $$;

COMMIT;
