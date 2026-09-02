-- Recruiters may read active selective-disclosure presentations only.
-- Revoked and expired rows stay hidden; learners keep full access to their own shares.
DROP POLICY IF EXISTS "selective_disclosure_presentations_select_recruiter" ON public.selective_disclosure_presentations;
CREATE POLICY "selective_disclosure_presentations_select_recruiter"
  ON public.selective_disclosure_presentations
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'recruiter')
    AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > now())
  );
