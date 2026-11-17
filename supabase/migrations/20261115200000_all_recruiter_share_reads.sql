-- All-recruiter shares are readable by every authenticated recruiter.
-- LOCAL FILE ONLY. Do not apply to hosted Supabase without explicit approval.
-- Does not change tokens, hashes, DIDs, credential documents, proof bytes, or Groth16 keys.
-- A public verification link has no shareKind of all-recruiters and stays invisible.
-- A direct share stays limited to its recipient policy.
-- This policy does not grant the learner profile, contact row, credentials, or evidence tables.
-- Recruiters cannot insert or update these rows.

DROP POLICY IF EXISTS "selective_disclosure_presentations_select_all_recruiters"
  ON public.selective_disclosure_presentations;

CREATE POLICY "selective_disclosure_presentations_select_all_recruiters"
  ON public.selective_disclosure_presentations
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'recruiter')
    AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > now())
    AND disclosed_payload->>'shareKind' = 'all-recruiters'
  );

COMMENT ON POLICY "selective_disclosure_presentations_select_all_recruiters"
  ON public.selective_disclosure_presentations
  IS 'Active all-recruiter shares are readable by recruiter accounts only. Public links and other learners stay hidden.';
