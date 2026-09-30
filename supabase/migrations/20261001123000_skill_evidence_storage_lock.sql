-- skill-evidence: owners may upload new objects but cannot overwrite or delete
-- once stored. Verify re-hashes bytes from Storage; that is the integrity control
-- if an object is replaced out-of-band by the service role.
-- Idempotent. Does not edit prior migrations.

INSERT INTO storage.buckets (id, name, public)
VALUES ('skill-evidence', 'skill-evidence', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "skill_evidence_select_own" ON storage.objects;
DROP POLICY IF EXISTS "skill_evidence_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "skill_evidence_update_own" ON storage.objects;
DROP POLICY IF EXISTS "skill_evidence_delete_own" ON storage.objects;

CREATE POLICY "skill_evidence_select_own"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'skill-evidence'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

CREATE POLICY "skill_evidence_insert_own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'skill-evidence'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

-- Intentionally no UPDATE or DELETE policies for authenticated users.
-- Service role (backend cleanup) bypasses RLS.
