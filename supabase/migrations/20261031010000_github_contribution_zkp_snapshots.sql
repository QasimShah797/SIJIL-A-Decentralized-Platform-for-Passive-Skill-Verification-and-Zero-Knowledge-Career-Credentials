-- Trusted GitHub contribution snapshots for github-contributions-v1.
-- Only the backend service role may create records through the trusted RPCs.
-- The private count and blinding are stored separately from public proof rows.
-- These records are immutable. This migration does not grant a client write path.
--
-- "Contribution" here means unique verified repository commit SHAs.
-- It is not GitHub's contribution graph.
--
-- Do not apply this file to the live Supabase project without explicit approval.
--
-- LIVE DEPLOYMENT NOTE (project nhzvtqpplfruzocframc / Sijil):
-- supabase_migrations.schema_migrations is currently empty while older SIJIL
-- tables already exist. Do NOT run `supabase db push` for this change; it would
-- attempt earlier migrations against an already-populated schema.
-- Apply ONLY this file (SQL editor or `supabase db query --linked --file ...`),
-- then record version 20261031010000 in schema_migrations / migration repair.

CREATE OR REPLACE FUNCTION public.is_canonical_bn254_decimal(value text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT value ~ '^(0|[1-9][0-9]*)$'
    AND length(value) <= 78
    AND value::numeric < 21888242871839275222246405745257275088548364400416034343698204186575808495617::numeric
$$;

REVOKE ALL ON FUNCTION public.is_canonical_bn254_decimal(text)
  FROM PUBLIC, anon, authenticated;

CREATE TABLE public.github_contribution_snapshots (
  id uuid PRIMARY KEY,
  learner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  github_user_id bigint NOT NULL CHECK (
    github_user_id > 0 AND github_user_id <= 9007199254740991
  ),
  github_username text NOT NULL CHECK (github_username ~ '^[A-Za-z0-9-]{1,39}$'),
  repository_full_name text NOT NULL CHECK (
    repository_full_name ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'
  ),
  verified_at timestamptz NOT NULL,
  commitment text NOT NULL CHECK (public.is_canonical_bn254_decimal(commitment)),
  commitment_scheme text NOT NULL DEFAULT 'poseidon-bn254-v1'
    CHECK (commitment_scheme = 'poseidon-bn254-v1'),
  commitment_circuit_id text NOT NULL DEFAULT 'github-contributions-v1'
    CHECK (commitment_circuit_id = 'github-contributions-v1'),
  commitment_version integer NOT NULL DEFAULT 1
    CHECK (commitment_version = 1),
  evidence_kind text NOT NULL DEFAULT 'unique_verified_commit_shas'
    CHECK (evidence_kind = 'unique_verified_commit_shas'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, learner_user_id)
);

CREATE TABLE public.github_contribution_openings (
  snapshot_id uuid PRIMARY KEY,
  learner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  FOREIGN KEY (snapshot_id, learner_user_id)
    REFERENCES public.github_contribution_snapshots(id, learner_user_id)
    ON DELETE RESTRICT,
  contribution_count bigint NOT NULL
    CHECK (contribution_count BETWEEN 0 AND 4294967295),
  blinding text NOT NULL CHECK (public.is_canonical_bn254_decimal(blinding)),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.github_contribution_proofs (
  id uuid PRIMARY KEY,
  snapshot_id uuid NOT NULL,
  learner_user_id uuid NOT NULL,
  FOREIGN KEY (snapshot_id, learner_user_id)
    REFERENCES public.github_contribution_snapshots(id, learner_user_id)
    ON DELETE RESTRICT,
  threshold bigint NOT NULL CHECK (threshold BETWEEN 0 AND 4294967295),
  public_threshold text NOT NULL,
  public_commitment text NOT NULL CHECK (public.is_canonical_bn254_decimal(public_commitment)),
  proof jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, learner_user_id),
  UNIQUE (snapshot_id, threshold),
  CHECK (public_threshold = threshold::text),
  CHECK (octet_length(proof::text) BETWEEN 2 AND 16384),
  CHECK (jsonb_typeof(proof) = 'object'),
  CHECK (
    NOT (proof ? 'count')
    AND NOT (proof ? 'blinding')
    AND NOT (proof ? 'opening')
    AND NOT (proof ? 'contributionCount')
    AND NOT (proof ? 'contribution_count')
  )
);

CREATE TABLE public.github_contribution_disclosures (
  id uuid PRIMARY KEY,
  proof_id uuid NOT NULL,
  learner_user_id uuid NOT NULL,
  FOREIGN KEY (proof_id, learner_user_id)
    REFERENCES public.github_contribution_proofs(id, learner_user_id)
    ON DELETE RESTRICT,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX github_contribution_snapshots_learner_idx
  ON public.github_contribution_snapshots (learner_user_id, verified_at DESC);

CREATE INDEX github_contribution_openings_learner_idx
  ON public.github_contribution_openings (learner_user_id);

CREATE INDEX github_contribution_proofs_learner_idx
  ON public.github_contribution_proofs (learner_user_id, created_at DESC);

CREATE INDEX github_contribution_disclosures_learner_idx
  ON public.github_contribution_disclosures (learner_user_id);

ALTER TABLE public.github_contribution_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.github_contribution_openings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.github_contribution_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.github_contribution_disclosures ENABLE ROW LEVEL SECURITY;

-- A later permissive policy still cannot open these rows to browser roles.
CREATE POLICY github_contribution_snapshots_deny_client
  ON public.github_contribution_snapshots
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY github_contribution_openings_deny_client
  ON public.github_contribution_openings
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY github_contribution_proofs_deny_client
  ON public.github_contribution_proofs
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY github_contribution_disclosures_deny_client
  ON public.github_contribution_disclosures
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON public.github_contribution_snapshots
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.github_contribution_openings
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.github_contribution_proofs
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.github_contribution_disclosures
  FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.github_contribution_snapshots TO service_role;
GRANT SELECT ON public.github_contribution_openings TO service_role;
GRANT SELECT ON public.github_contribution_proofs TO service_role;
GRANT SELECT ON public.github_contribution_disclosures TO service_role;

CREATE OR REPLACE FUNCTION public.create_github_contribution_snapshot(
  p_snapshot_id uuid,
  p_learner_user_id uuid,
  p_github_user_id bigint,
  p_github_username text,
  p_repository_full_name text,
  p_verified_at timestamptz,
  p_commitment text,
  p_contribution_count bigint,
  p_blinding text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_snapshot_id IS NULL
     OR p_learner_user_id IS NULL
     OR p_github_user_id IS NULL
     OR p_github_user_id <= 0
     OR p_github_user_id > 9007199254740991
     OR p_github_username IS NULL
     OR p_github_username !~ '^[A-Za-z0-9-]{1,39}$'
     OR p_repository_full_name IS NULL
     OR p_repository_full_name !~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'
     OR p_verified_at IS NULL
     OR p_verified_at > now() + interval '5 minutes'
     OR p_commitment IS NULL
     OR NOT public.is_canonical_bn254_decimal(p_commitment)
     OR p_contribution_count IS NULL
     OR p_contribution_count < 0
     OR p_contribution_count > 4294967295
     OR p_blinding IS NULL
     OR NOT public.is_canonical_bn254_decimal(p_blinding)
  THEN
    RAISE EXCEPTION 'Invalid GitHub contribution snapshot';
  END IF;

  INSERT INTO public.github_contribution_snapshots (
    id,
    learner_user_id,
    github_user_id,
    github_username,
    repository_full_name,
    verified_at,
    commitment
  )
  VALUES (
    p_snapshot_id,
    p_learner_user_id,
    p_github_user_id,
    p_github_username,
    p_repository_full_name,
    p_verified_at,
    p_commitment
  );

  INSERT INTO public.github_contribution_openings (
    snapshot_id,
    learner_user_id,
    contribution_count,
    blinding
  )
  VALUES (
    p_snapshot_id,
    p_learner_user_id,
    p_contribution_count,
    p_blinding
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_github_contribution_proof(
  p_proof_id uuid,
  p_snapshot_id uuid,
  p_learner_user_id uuid,
  p_threshold bigint,
  p_proof jsonb,
  p_public_threshold text,
  p_public_commitment text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  snapshot_commitment text;
BEGIN
  IF p_proof_id IS NULL
     OR p_snapshot_id IS NULL
     OR p_learner_user_id IS NULL
     OR p_threshold IS NULL
     OR p_threshold < 0
     OR p_threshold > 4294967295
     OR p_public_threshold IS DISTINCT FROM p_threshold::text
     OR p_public_commitment IS NULL
     OR NOT public.is_canonical_bn254_decimal(p_public_commitment)
     OR p_proof IS NULL
     OR jsonb_typeof(p_proof) IS DISTINCT FROM 'object'
     OR octet_length(p_proof::text) > 16384
     OR p_proof ? 'count'
     OR p_proof ? 'blinding'
     OR p_proof ? 'opening'
     OR p_proof ? 'contributionCount'
     OR p_proof ? 'contribution_count'
  THEN
    RAISE EXCEPTION 'Invalid GitHub contribution proof';
  END IF;

  SELECT commitment
    INTO snapshot_commitment
  FROM public.github_contribution_snapshots
  WHERE id = p_snapshot_id
    AND learner_user_id = p_learner_user_id;

  IF snapshot_commitment IS NULL OR snapshot_commitment IS DISTINCT FROM p_public_commitment THEN
    RAISE EXCEPTION 'Invalid GitHub contribution proof';
  END IF;

  INSERT INTO public.github_contribution_proofs (
    id,
    snapshot_id,
    learner_user_id,
    threshold,
    public_threshold,
    public_commitment,
    proof
  )
  VALUES (
    p_proof_id,
    p_snapshot_id,
    p_learner_user_id,
    p_threshold,
    p_public_threshold,
    p_public_commitment,
    p_proof
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_github_contribution_disclosure(
  p_disclosure_id uuid,
  p_proof_id uuid,
  p_learner_user_id uuid,
  p_token_hash text,
  p_expires_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owns_proof boolean;
BEGIN
  IF p_disclosure_id IS NULL
     OR p_proof_id IS NULL
     OR p_learner_user_id IS NULL
     OR p_token_hash IS NULL
     OR p_token_hash !~ '^[0-9a-f]{64}$'
     OR p_expires_at IS NULL
     OR p_expires_at <= now()
     OR p_expires_at > now() + interval '30 days'
  THEN
    RAISE EXCEPTION 'Invalid GitHub contribution disclosure';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.github_contribution_proofs
    WHERE id = p_proof_id
      AND learner_user_id = p_learner_user_id
  ) INTO owns_proof;

  IF NOT owns_proof THEN
    RAISE EXCEPTION 'Invalid GitHub contribution disclosure';
  END IF;

  INSERT INTO public.github_contribution_disclosures (
    id,
    proof_id,
    learner_user_id,
    token_hash,
    expires_at
  )
  VALUES (
    p_disclosure_id,
    p_proof_id,
    p_learner_user_id,
    p_token_hash,
    p_expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_github_contribution_snapshot(
  uuid, uuid, bigint, text, text, timestamptz, text, bigint, text
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.create_github_contribution_proof(
  uuid, uuid, uuid, bigint, jsonb, text, text
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.create_github_contribution_disclosure(
  uuid, uuid, uuid, text, timestamptz
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_github_contribution_snapshot(
  uuid, uuid, bigint, text, text, timestamptz, text, bigint, text
) TO service_role;

GRANT EXECUTE ON FUNCTION public.create_github_contribution_proof(
  uuid, uuid, uuid, bigint, jsonb, text, text
) TO service_role;

GRANT EXECUTE ON FUNCTION public.create_github_contribution_disclosure(
  uuid, uuid, uuid, text, timestamptz
) TO service_role;

-- Prevent modification or deletion of trusted GitHub ZKP records.
-- Retention is append-only until a separately approved erasure migration.

CREATE OR REPLACE FUNCTION public.prevent_github_zkp_record_changes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Trusted GitHub ZKP records cannot be modified or deleted';
END;
$$;

CREATE TRIGGER protect_github_contribution_snapshots
  BEFORE UPDATE OR DELETE ON public.github_contribution_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_github_zkp_record_changes();

CREATE TRIGGER protect_github_contribution_openings
  BEFORE UPDATE OR DELETE ON public.github_contribution_openings
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_github_zkp_record_changes();

CREATE TRIGGER protect_github_contribution_proofs
  BEFORE UPDATE OR DELETE ON public.github_contribution_proofs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_github_zkp_record_changes();

CREATE TRIGGER protect_github_contribution_disclosures
  BEFORE UPDATE OR DELETE ON public.github_contribution_disclosures
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_github_zkp_record_changes();

REVOKE ALL ON FUNCTION public.prevent_github_zkp_record_changes()
  FROM PUBLIC, anon, authenticated, service_role;
