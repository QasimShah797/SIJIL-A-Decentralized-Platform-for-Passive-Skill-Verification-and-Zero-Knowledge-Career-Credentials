-- SIJIL learner exact-value disclosure permissions.
-- LOCAL FILE ONLY until explicitly approved for live apply.
-- Additive: no existing table, row, proof, credential, or anchor is modified.
-- No backfill: learners without a row read as OFF for both permissions.
-- Permissions only gate recruiter disclosure; they never affect proof generation or outcomes.

BEGIN;

CREATE TABLE IF NOT EXISTS public.learner_disclosure_preferences (
  learner_user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  share_exact_assessment_marks boolean NOT NULL DEFAULT false,
  share_exact_github_commit_count boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.learner_disclosure_preferences ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'learner_disclosure_preferences'
      AND policyname = 'learner_disclosure_preferences_deny_client'
  ) THEN
    CREATE POLICY learner_disclosure_preferences_deny_client
      ON public.learner_disclosure_preferences
      FOR ALL
      TO anon, authenticated
      USING (false)
      WITH CHECK (false);
  END IF;
END
$$;

REVOKE ALL ON public.learner_disclosure_preferences FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.learner_disclosure_preferences TO service_role;

COMMIT;
