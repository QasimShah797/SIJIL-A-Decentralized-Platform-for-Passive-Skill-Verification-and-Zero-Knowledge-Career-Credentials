-- Minimal live compatibility for GitHub evidence, wallet_ready promotion,
-- credential issuance, and verification.
--
-- Creates public.supporting_records only. Does not create
-- institution_attestation_requests, skill_evidence_links, or
-- github_repo_skill_links. Does not add declared_skills.updated_at.
-- Does not UPDATE or DELETE existing learner rows.
--
-- Also hardens public.github_repos so learners cannot insert spoofed
-- repositories that the backend would copy into supporting_records.
-- Learners may still SELECT, UPDATE link columns, and DELETE their rows.
--
-- Idempotent. Apply this file only; do not replay older schema-gap migrations.

CREATE TABLE IF NOT EXISTS public.supporting_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_id uuid REFERENCES public.declared_skills(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'Upload',
  title text NOT NULL,
  url text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  content_hash text
);

COMMENT ON TABLE public.supporting_records IS
  'Learner evidence for GitHub corroboration, wallet_ready promotion, issuance, and verification.';
COMMENT ON COLUMN public.supporting_records.content_hash IS
  'SHA-256 hex of uploaded file bytes, or of RFC 8785 canonical metadata for links/GitHub records';

ALTER TABLE public.supporting_records
  ADD COLUMN IF NOT EXISTS content_hash text;

ALTER TABLE public.supporting_records ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "supporting_records_select_own" ON public.supporting_records
    FOR SELECT TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "supporting_records_insert_own" ON public.supporting_records;
CREATE POLICY "supporting_records_insert_own" ON public.supporting_records
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (
      skill_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.declared_skills ds
        WHERE ds.id = skill_id
          AND ds.user_id = auth.uid()
      )
    )
  );

CREATE INDEX IF NOT EXISTS supporting_records_user_skill_idx
  ON public.supporting_records (user_id, skill_id);

CREATE INDEX IF NOT EXISTS supporting_records_user_skill_source_idx
  ON public.supporting_records (user_id, skill_id, source);

CREATE OR REPLACE FUNCTION public.guard_supporting_records_skill_owner()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.skill_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.declared_skills ds
    WHERE ds.id = NEW.skill_id
      AND ds.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'supporting_records.skill_id must belong to the same user';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_supporting_records_skill_owner ON public.supporting_records;
CREATE TRIGGER trg_guard_supporting_records_skill_owner
  BEFORE INSERT OR UPDATE ON public.supporting_records
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_supporting_records_skill_owner();

CREATE OR REPLACE FUNCTION public.guard_supporting_records_trust_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  new_json jsonb := to_jsonb(NEW);
  old_json jsonb;
  col text;
  trust_cols text[] := ARRAY[
    'content_hash',
    'source',
    'origin',
    'pipeline_stage',
    'verification_status',
    'attestation_status',
    'lms_verified',
    'verified'
  ];
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    FOREACH col IN ARRAY trust_cols LOOP
      IF new_json ? col AND (new_json -> col) IS NOT NULL AND NULLIF(new_json ->> col, '') IS NOT NULL THEN
        IF col IN ('pipeline_stage', 'verification_status', 'attestation_status')
           AND lower(new_json ->> col) IN ('pending') THEN
          CONTINUE;
        END IF;
        IF col IN ('lms_verified', 'verified')
           AND (new_json ->> col) NOT IN ('true', 't', '1') THEN
          CONTINUE;
        END IF;
        RAISE EXCEPTION 'Trust-bearing column % can only be written by the backend', col;
      END IF;
    END LOOP;
    RETURN NEW;
  END IF;

  old_json := to_jsonb(OLD);
  FOREACH col IN ARRAY trust_cols LOOP
    IF (new_json ? col) AND (old_json ? col)
       AND (new_json -> col) IS DISTINCT FROM (old_json -> col) THEN
      RAISE EXCEPTION 'Trust-bearing column % can only be written by the backend', col;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_supporting_records_trust_columns ON public.supporting_records;
CREATE TRIGGER trg_guard_supporting_records_trust_columns
  BEFORE INSERT OR UPDATE ON public.supporting_records
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_supporting_records_trust_columns();

GRANT SELECT, INSERT ON TABLE public.supporting_records TO authenticated;
GRANT ALL ON TABLE public.supporting_records TO service_role;

-- Learners may link synced repos to skills, but must not mint repository identity.
CREATE OR REPLACE FUNCTION public.guard_github_repos_trust_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  new_json jsonb := to_jsonb(NEW);
  old_json jsonb;
  col text;
  trust_cols text[] := ARRAY[
    'github_url',
    'repo_id',
    'repo_name',
    'full_name',
    'github_username',
    'user_id'
  ];
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'github_repos can only be inserted by the backend';
  END IF;

  old_json := to_jsonb(OLD);
  FOREACH col IN ARRAY trust_cols LOOP
    IF (new_json ? col) AND (old_json ? col)
       AND (new_json -> col) IS DISTINCT FROM (old_json -> col) THEN
      RAISE EXCEPTION 'Trust-bearing column % can only be written by the backend', col;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.github_repos') IS NULL THEN
    RETURN;
  END IF;
  EXECUTE 'DROP POLICY IF EXISTS "gh_repos_insert_own" ON public.github_repos';
  EXECUTE 'REVOKE INSERT ON TABLE public.github_repos FROM authenticated';
  EXECUTE 'DROP TRIGGER IF EXISTS trg_guard_github_repos_trust_columns ON public.github_repos';
  EXECUTE $trig$
    CREATE TRIGGER trg_guard_github_repos_trust_columns
      BEFORE INSERT OR UPDATE ON public.github_repos
      FOR EACH ROW
      EXECUTE FUNCTION public.guard_github_repos_trust_columns()
  $trig$;
END $$;

NOTIFY pgrst, 'reload schema';
