-- Direct recruiter shares are visible only to the selected recipient.
-- LOCAL FILE ONLY. Do not apply to hosted Supabase without explicit approval.
-- Does not change tokens, hashes, DIDs, credential documents, proof bytes, or Groth16 keys.
-- A public verification link has no recipientUserId and stays invisible to every recruiter.
-- This policy does not grant recruiters the learner profile, contact row, credentials, or evidence tables.

DROP POLICY IF EXISTS "selective_disclosure_presentations_select_direct_recipient"
  ON public.selective_disclosure_presentations;

CREATE POLICY "selective_disclosure_presentations_select_direct_recipient"
  ON public.selective_disclosure_presentations
  FOR SELECT
  TO authenticated
  USING (
    revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > now())
    AND disclosed_payload->>'shareKind' = 'direct-recruiter'
    AND disclosed_payload->>'recipientUserId' = auth.uid()::text
  );

COMMENT ON POLICY "selective_disclosure_presentations_select_direct_recipient"
  ON public.selective_disclosure_presentations
  IS 'Recipient-only read of an active direct share. Does not apply to public links or other recruiters.';
