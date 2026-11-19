-- Additive link from a new credential row to its competency version.
-- Existing credential rows stay null. This does not rewrite them.
-- Do not apply to hosted Supabase until explicitly approved.

BEGIN;

ALTER TABLE public.credentials
  ADD COLUMN IF NOT EXISTS competency_version_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS credentials_competency_version_once
  ON public.credentials (competency_version_id)
  WHERE competency_version_id IS NOT NULL;

DO $$
BEGIN
  IF to_regclass('public.competency_credential_versions') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conrelid = 'public.competency_credential_versions'::regclass
         AND contype = 'f'
         AND pg_get_constraintdef(oid) ILIKE '%(credential_id)%'
     ) THEN
    ALTER TABLE public.competency_credential_versions
      ADD CONSTRAINT competency_versions_credential_fk
      FOREIGN KEY (credential_id) REFERENCES public.credentials(id);
  END IF;
END $$;

COMMIT;
