-- Lock trust-bearing credential/wallet writes to the Express service role.
-- Idempotent: safe on remotes that never applied earlier domain-table migrations.
-- Learners keep SELECT. Write policies are dropped (or never created).

-- ── ensure tables exist (DROP POLICY requires the relation) ──
CREATE TABLE IF NOT EXISTS public.credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credential_uri text NOT NULL,
  name text NOT NULL,
  credential_types text[] NOT NULL DEFAULT ARRAY['VerifiableCredential'],
  issuer_name text NOT NULL,
  issuer_did text NOT NULL,
  holder_did text NOT NULL,
  valid_from timestamptz NOT NULL DEFAULT now(),
  verification_status text NOT NULL DEFAULT 'Pending',
  attestation_status text NOT NULL DEFAULT 'Pending',
  supporting_records int NOT NULL DEFAULT 0,
  skill_name text,
  proof jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, credential_uri)
);

ALTER TABLE public.credentials ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS credentials_user_idx ON public.credentials (user_id);

DO $$ BEGIN
  CREATE POLICY "credentials_select_own" ON public.credentials
    FOR SELECT TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "credentials_select_recruiter" ON public.credentials
    FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'recruiter'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_function THEN NULL;
END $$;

DO $$
BEGIN
  IF to_regclass('public.declared_skills') IS NOT NULL THEN
    CREATE TABLE IF NOT EXISTS public.wallet_competency_records (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      learner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      competency_id uuid NOT NULL REFERENCES public.declared_skills(id) ON DELETE CASCADE,
      competency_name text NOT NULL,
      status text NOT NULL,
      practical_task_status text,
      evidence_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (learner_id, competency_id)
    );

    CREATE TABLE IF NOT EXISTS public.selective_disclosure_presentations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      learner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      competency_id uuid NOT NULL REFERENCES public.declared_skills(id) ON DELETE CASCADE,
      selected_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
      selection_mode text NOT NULL DEFAULT 'custom',
      disclosed_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      payload_hash text NOT NULL,
      proof_type text NOT NULL,
      proof_value text,
      verification_method text,
      share_token_hash text NOT NULL,
      share_token_hint text,
      expires_at timestamptz,
      revoked_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (share_token_hash)
    );
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.wallet_competency_records') IS NOT NULL THEN
    ALTER TABLE public.wallet_competency_records ENABLE ROW LEVEL SECURITY;
    CREATE INDEX IF NOT EXISTS wallet_competency_records_learner_updated_idx
      ON public.wallet_competency_records (learner_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS wallet_competency_records_competency_idx
      ON public.wallet_competency_records (competency_id);
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.selective_disclosure_presentations') IS NOT NULL THEN
    ALTER TABLE public.selective_disclosure_presentations ENABLE ROW LEVEL SECURITY;
    CREATE INDEX IF NOT EXISTS selective_disclosure_presentations_learner_idx
      ON public.selective_disclosure_presentations (learner_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS selective_disclosure_presentations_competency_idx
      ON public.selective_disclosure_presentations (competency_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS selective_disclosure_presentations_active_idx
      ON public.selective_disclosure_presentations (share_token_hash, revoked_at, expires_at);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.wallet_competency_records') IS NULL THEN
    RETURN;
  END IF;
  CREATE POLICY "wallet_competency_records_select_own"
    ON public.wallet_competency_records
    FOR SELECT TO authenticated
    USING (auth.uid() = learner_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  IF to_regclass('public.selective_disclosure_presentations') IS NULL THEN
    RETURN;
  END IF;
  CREATE POLICY "selective_disclosure_presentations_select_own"
    ON public.selective_disclosure_presentations
    FOR SELECT TO authenticated
    USING (auth.uid() = learner_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  IF to_regclass('public.selective_disclosure_presentations') IS NULL THEN
    RETURN;
  END IF;
  CREATE POLICY "selective_disclosure_presentations_select_recruiter"
    ON public.selective_disclosure_presentations
    FOR SELECT TO authenticated
    USING (
      public.has_role(auth.uid(), 'recruiter')
      AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > now())
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_function THEN NULL;
END $$;

-- Drop authenticated write policies (SELECT remains). No-ops if a policy was never created.
DROP POLICY IF EXISTS "credentials_insert_own" ON public.credentials;
DROP POLICY IF EXISTS "credentials_update_own" ON public.credentials;
DROP POLICY IF EXISTS "credentials_delete_own" ON public.credentials;

DO $$
BEGIN
  IF to_regclass('public.wallet_competency_records') IS NOT NULL THEN
    DROP POLICY IF EXISTS "wallet_competency_records_insert_own" ON public.wallet_competency_records;
    DROP POLICY IF EXISTS "wallet_competency_records_update_own" ON public.wallet_competency_records;
    DROP POLICY IF EXISTS "wallet_competency_records_delete_own" ON public.wallet_competency_records;
  END IF;

  IF to_regclass('public.selective_disclosure_presentations') IS NOT NULL THEN
    DROP POLICY IF EXISTS "selective_disclosure_presentations_insert_own" ON public.selective_disclosure_presentations;
    DROP POLICY IF EXISTS "selective_disclosure_presentations_update_own" ON public.selective_disclosure_presentations;
    DROP POLICY IF EXISTS "selective_disclosure_presentations_delete_own" ON public.selective_disclosure_presentations;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.guard_declared_skills_trust_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  new_json jsonb := to_jsonb(NEW);
  old_json jsonb;
  col text;
  trust_cols text[] := ARRAY[
    'pipeline_stage',
    'status',
    'last_credential_sync_at',
    'verification_status',
    'attestation_status',
    'lms_verified',
    'verified'
  ];
  pipeline_stage_val text := new_json ->> 'pipeline_stage';
  status_val text := new_json ->> 'status';
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF (new_json ? 'pipeline_stage')
       AND pipeline_stage_val IS NOT NULL
       AND pipeline_stage_val IS DISTINCT FROM 'declared' THEN
      RAISE EXCEPTION 'Trust-bearing column pipeline_stage can only be written by the backend';
    END IF;
    IF (new_json ? 'status')
       AND status_val IS NOT NULL
       AND status_val IS DISTINCT FROM 'Skill Claimed' THEN
      RAISE EXCEPTION 'Trust-bearing column status can only be written by the backend';
    END IF;
    IF (new_json ? 'last_credential_sync_at')
       AND NULLIF(new_json ->> 'last_credential_sync_at', '') IS NOT NULL THEN
      RAISE EXCEPTION 'Trust-bearing column last_credential_sync_at can only be written by the backend';
    END IF;
    FOREACH col IN ARRAY ARRAY['verification_status', 'attestation_status'] LOOP
      IF new_json ? col
         AND NULLIF(new_json ->> col, '') IS NOT NULL
         AND lower(new_json ->> col) NOT IN ('pending') THEN
        RAISE EXCEPTION 'Trust-bearing column % can only be written by the backend', col;
      END IF;
    END LOOP;
    FOREACH col IN ARRAY ARRAY['lms_verified', 'verified'] LOOP
      IF new_json ? col AND (new_json ->> col) IN ('true', 't', '1') THEN
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

CREATE OR REPLACE FUNCTION public.guard_supporting_records_trust_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  new_json jsonb := to_jsonb(NEW);
  old_json jsonb;
  col text;
  trust_cols text[] := ARRAY[
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
    FOREACH col IN ARRAY ARRAY['pipeline_stage', 'verification_status', 'attestation_status'] LOOP
      IF new_json ? col
         AND NULLIF(new_json ->> col, '') IS NOT NULL
         AND lower(new_json ->> col) NOT IN ('pending') THEN
        RAISE EXCEPTION 'Trust-bearing column % can only be written by the backend', col;
      END IF;
    END LOOP;
    FOREACH col IN ARRAY ARRAY['lms_verified', 'verified'] LOOP
      IF new_json ? col AND (new_json ->> col) IN ('true', 't', '1') THEN
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

DO $$
BEGIN
  IF to_regclass('public.declared_skills') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_guard_declared_skills_trust_columns ON public.declared_skills;
    CREATE TRIGGER trg_guard_declared_skills_trust_columns
      BEFORE INSERT OR UPDATE ON public.declared_skills
      FOR EACH ROW
      EXECUTE FUNCTION public.guard_declared_skills_trust_columns();
  END IF;

  IF to_regclass('public.supporting_records') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_guard_supporting_records_trust_columns ON public.supporting_records;
    CREATE TRIGGER trg_guard_supporting_records_trust_columns
      BEFORE INSERT OR UPDATE ON public.supporting_records
      FOR EACH ROW
      EXECUTE FUNCTION public.guard_supporting_records_trust_columns();
  END IF;
END $$;
