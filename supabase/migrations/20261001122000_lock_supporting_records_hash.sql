-- Tighten supporting_records trust columns (content_hash, source, origin, verification flags).
-- Idempotent. Does not edit prior migrations.

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
