-- SIJIL Phase 17C: append-only learner journey events ledger.
-- LOCAL FILE ONLY until explicitly approved for live/staging apply.
-- Does not capture events, change skill deletion, credentials, Fabric, or ZKP.
-- Does not create a public insertion RPC or privacy-redaction admin bypass.
--
-- Append-only enforcement is least-privilege (RLS + grants + trigger).
-- Database owners / superusers can still disable triggers or ALTER privileges;
-- that is outside application trust boundaries (see Step 17B.1).
--
-- Outbox table deferred to 17D until atomic write paths and worker ownership
-- are implemented alongside capture hooks.
--
-- Payload key allowlists are enforced by trusted application helpers in 17D,
-- not by unrestricted client JSON. This migration only requires jsonb objects
-- and Phase-17 event_type / source_system vocabulary.

BEGIN;

CREATE TABLE IF NOT EXISTS public.learner_journey_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ON DELETE RESTRICT is intentional: historical journey events must not vanish
  -- when an auth.users row is removed. Existing events can therefore block hard
  -- deletion of that user until a separately approved account-retention/erasure
  -- policy (and privileged procedure) exists. Do not silently change this to
  -- ON DELETE CASCADE.
  learner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  -- Soft competency reference: intentionally NOT a FK to declared_skills so
  -- historical rows survive skill rename/delete (capture ordering is a 17D concern).
  competency_id uuid NULL,
  competency_name_at_event text NULL,
  event_type text NOT NULL,
  source_system text NOT NULL,
  source_record_id text NULL,
  source_event_id text NOT NULL,
  occurred_at timestamptz NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  event_version smallint NOT NULL DEFAULT 1,
  event_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  provenance_kind text NOT NULL DEFAULT 'live_v1',
  supersedes_event_id uuid NULL REFERENCES public.learner_journey_events(id) ON DELETE RESTRICT,
  correction_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT learner_journey_events_source_event_unique
    UNIQUE (learner_user_id, source_event_id),

  CONSTRAINT learner_journey_events_event_type_check
    CHECK (event_type IN (
      'assessment_completed',
      'credential_issued',
      'credential_revoked',
      'skill_declared',
      'skill_declaration_updated',
      'skill_deleted',
      'supporting_evidence_added'
    )),

  CONSTRAINT learner_journey_events_source_system_check
    CHECK (source_system IN (
      'mcq',
      'credential',
      'supporting',
      'sijil'
    )),

  CONSTRAINT learner_journey_events_event_version_check
    CHECK (event_version > 0),

  CONSTRAINT learner_journey_events_payload_object_check
    CHECK (jsonb_typeof(event_payload) = 'object'),

  CONSTRAINT learner_journey_events_provenance_kind_check
    CHECK (provenance_kind IN ('live_v1', 'backfill_v1')),

  CONSTRAINT learner_journey_events_correction_pair_check
    CHECK (
      (supersedes_event_id IS NULL AND correction_reason IS NULL)
      OR (
        supersedes_event_id IS NOT NULL
        AND correction_reason IS NOT NULL
        AND length(btrim(correction_reason)) >= 3
      )
    )
);

CREATE INDEX IF NOT EXISTS learner_journey_events_learner_occurred_idx
  ON public.learner_journey_events (learner_user_id, occurred_at DESC NULLS LAST, id);

CREATE INDEX IF NOT EXISTS learner_journey_events_learner_recorded_idx
  ON public.learner_journey_events (learner_user_id, recorded_at DESC, id);

CREATE INDEX IF NOT EXISTS learner_journey_events_competency_idx
  ON public.learner_journey_events (competency_id)
  WHERE competency_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS learner_journey_events_supersedes_idx
  ON public.learner_journey_events (supersedes_event_id)
  WHERE supersedes_event_id IS NOT NULL;

COMMENT ON TABLE public.learner_journey_events IS
  'Append-only Phase-17 learner history events. Trusted service INSERT only; learners SELECT own rows.';

COMMENT ON COLUMN public.learner_journey_events.competency_id IS
  'Competency UUID at event time; not FK-cascaded to declared_skills.';

COMMENT ON COLUMN public.learner_journey_events.source_event_id IS
  'Stable idempotency key (e.g. mcq:{id}:completed, skill:{id}:rev:{seq}).';

COMMENT ON COLUMN public.learner_journey_events.event_payload IS
  'Allowlisted JSON object only; key validation belongs in 17D trusted writers.';

-- ---------------------------------------------------------------------------
-- RLS: learners read own rows; no client writes
-- ---------------------------------------------------------------------------
ALTER TABLE public.learner_journey_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS learner_journey_events_select_own ON public.learner_journey_events;
CREATE POLICY learner_journey_events_select_own
  ON public.learner_journey_events
  FOR SELECT
  TO authenticated
  USING (auth.uid() = learner_user_id);

-- Explicit deny of writes for client roles (defense in depth alongside REVOKE).
DROP POLICY IF EXISTS learner_journey_events_deny_client_write ON public.learner_journey_events;
CREATE POLICY learner_journey_events_deny_client_write
  ON public.learner_journey_events
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.learner_journey_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.learner_journey_events TO authenticated;
-- service_role bypasses RLS by default; grant only INSERT+SELECT (no UPDATE/DELETE).
GRANT SELECT, INSERT ON TABLE public.learner_journey_events TO service_role;

-- ---------------------------------------------------------------------------
-- Append-only: reject UPDATE/DELETE for ordinary sessions
-- Limitation: table owners / superusers can DISABLE TRIGGER or change grants.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_learner_journey_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'learner_journey_events is append-only; UPDATE/DELETE are not permitted';
END;
$$;

DROP TRIGGER IF EXISTS protect_learner_journey_events ON public.learner_journey_events;
CREATE TRIGGER protect_learner_journey_events
  BEFORE UPDATE OR DELETE ON public.learner_journey_events
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_learner_journey_event_mutation();

REVOKE ALL ON FUNCTION public.prevent_learner_journey_event_mutation()
  FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Insert guard: no self-supersession; superseding event must belong to same learner
-- Limitation: does not validate correction authorization (application/17D concern).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_learner_journey_event_supersession()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  prior_learner uuid;
BEGIN
  IF NEW.supersedes_event_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.supersedes_event_id = NEW.id THEN
    RAISE EXCEPTION 'learner_journey_events cannot supersede themselves';
  END IF;

  -- Table reference is schema-qualified so empty search_path remains safe.
  SELECT e.learner_user_id
    INTO prior_learner
  FROM public.learner_journey_events e
  WHERE e.id = NEW.supersedes_event_id;

  IF prior_learner IS NULL THEN
    RAISE EXCEPTION 'supersedes_event_id does not reference an existing journey event';
  END IF;

  IF prior_learner <> NEW.learner_user_id THEN
    RAISE EXCEPTION 'supersedes_event_id must reference an event for the same learner';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_learner_journey_events_supersession ON public.learner_journey_events;
CREATE TRIGGER enforce_learner_journey_events_supersession
  BEFORE INSERT ON public.learner_journey_events
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_learner_journey_event_supersession();

-- Trigger functions run as table owner; revoke direct EXECUTE from client roles
-- (same pattern as prevent_github_zkp_record_changes).
REVOKE ALL ON FUNCTION public.enforce_learner_journey_event_supersession()
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
