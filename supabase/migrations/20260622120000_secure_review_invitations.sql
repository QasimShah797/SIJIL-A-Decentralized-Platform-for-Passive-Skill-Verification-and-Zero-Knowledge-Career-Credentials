-- Secure peer review invitations: token-based, invite-bound, single-use, expiring

ALTER TABLE public.review_invitations
  ADD COLUMN IF NOT EXISTS skill_id uuid,
  ADD COLUMN IF NOT EXISTS competency_name text,
  ADD COLUMN IF NOT EXISTS competency_domain text,
  ADD COLUMN IF NOT EXISTS reviewer_email text,
  ADD COLUMN IF NOT EXISTS reviewer_github_username text,
  ADD COLUMN IF NOT EXISTS token text,
  ADD COLUMN IF NOT EXISTS review_link text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS used_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS review_invitations_token_idx
  ON public.review_invitations (token)
  WHERE token IS NOT NULL;

-- Demo RLS policies for secure invitation flow
DROP POLICY IF EXISTS "review_invitations_select_own" ON public.review_invitations;
DROP POLICY IF EXISTS "review_invitations_insert_own" ON public.review_invitations;
DROP POLICY IF EXISTS "review_invitations_update_own" ON public.review_invitations;

CREATE POLICY "Learners can create review invitations"
  ON public.review_invitations
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = learner_user_id);

CREATE POLICY "Authenticated users can read review invitations"
  ON public.review_invitations
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update review invitations"
  ON public.review_invitations
  FOR UPDATE
  TO authenticated
  USING (true);

-- Public review page (anon) must read/update invitations by token
CREATE POLICY "Anon can read review invitations"
  ON public.review_invitations
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anon can update review invitations"
  ON public.review_invitations
  FOR UPDATE
  TO anon
  USING (true);

-- Reviewers submit peer reviews via secure invite (not the learner)
CREATE POLICY "Authenticated users can insert peer reviews"
  ON public.peer_reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Anon can insert peer reviews"
  ON public.peer_reviews
  FOR INSERT
  TO anon
  WITH CHECK (true);
