-- Forward-only guards for competency versions.
-- Safe if 20261117180000 was applied from the earlier draft.
-- Do not apply this file to hosted Supabase until it is explicitly approved.
-- It does not update credential rows or write transaction ids.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.competency_credential_versions') IS NULL THEN
    RAISE EXCEPTION 'competency_credential_versions is not present. Apply 20261117180000 first.';
  END IF;
END $$;

ALTER TABLE public.competency_credential_versions
  ADD COLUMN IF NOT EXISTS evidence_source text,
  ADD COLUMN IF NOT EXISTS evidence_reference text,
  ADD COLUMN IF NOT EXISTS evidence_fingerprint text,
  ADD COLUMN IF NOT EXISTS validation_reference text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.competency_credential_versions
    WHERE evidence_source IS NULL OR evidence_reference IS NULL OR evidence_fingerprint IS NULL
  ) THEN
    RAISE EXCEPTION 'competency version rows are missing evidence provenance. Repair those rows before applying this migration.';
  END IF;
END $$;

ALTER TABLE public.competency_credential_versions
  ALTER COLUMN evidence_source SET NOT NULL,
  ALTER COLUMN evidence_reference SET NOT NULL,
  ALTER COLUMN evidence_fingerprint SET NOT NULL;

ALTER TABLE public.competency_credential_versions
  DROP CONSTRAINT IF EXISTS competency_credential_versions_status_check;

ALTER TABLE public.competency_credential_versions
  ADD CONSTRAINT competency_credential_versions_status_check
  CHECK (status IN ('pending_evidence', 'issued'));

ALTER TABLE public.competency_credential_versions
  DROP CONSTRAINT IF EXISTS competency_versions_issue_truth;

ALTER TABLE public.competency_credential_versions
  ADD CONSTRAINT competency_versions_issue_truth
  CHECK (status <> 'issued' OR (credential_id IS NOT NULL AND validation_reference IS NOT NULL));

ALTER TABLE public.competency_credential_versions
  DROP CONSTRAINT IF EXISTS competency_versions_evidence_once;

ALTER TABLE public.competency_credential_versions
  ADD CONSTRAINT competency_versions_evidence_once
  UNIQUE (learner_user_id, competency_key, evidence_fingerprint);

CREATE UNIQUE INDEX IF NOT EXISTS competency_versions_credential_once
  ON public.competency_credential_versions (credential_id)
  WHERE credential_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS competency_versions_validation_once
  ON public.competency_credential_versions (validation_reference)
  WHERE validation_reference IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS competency_versions_evidence_ref_once
  ON public.competency_credential_versions (learner_user_id, competency_key, evidence_reference);

CREATE OR REPLACE FUNCTION public.competency_versions_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'issued' THEN
    IF NEW.credential_id IS DISTINCT FROM OLD.credential_id
       OR NEW.version_number IS DISTINCT FROM OLD.version_number
       OR NEW.previous_version_id IS DISTINCT FROM OLD.previous_version_id
       OR NEW.evidence_fingerprint IS DISTINCT FROM OLD.evidence_fingerprint
       OR NEW.evidence_reference IS DISTINCT FROM OLD.evidence_reference
       OR NEW.validation_reference IS DISTINCT FROM OLD.validation_reference
       OR NEW.evidence_source IS DISTINCT FROM OLD.evidence_source
       OR NEW.competency_key IS DISTINCT FROM OLD.competency_key
       OR NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'an issued competency version cannot be rewritten';
    END IF;
  END IF;
  IF NEW.status = 'issued' AND (NEW.credential_id IS NULL OR NEW.validation_reference IS NULL) THEN
    RAISE EXCEPTION 'issued version requires a new credential and a validation reference';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS competency_versions_immutability ON public.competency_credential_versions;
CREATE TRIGGER competency_versions_immutability
  BEFORE INSERT OR UPDATE ON public.competency_credential_versions
  FOR EACH ROW EXECUTE FUNCTION public.competency_versions_immutability();

REVOKE ALL ON FUNCTION public.competency_versions_immutability() FROM PUBLIC, anon, authenticated;

COMMIT;
