-- Peer review backend: invites, trust-weight scores, and expanded RLS

ALTER TABLE public.peer_reviews
  ADD COLUMN IF NOT EXISTS trust_weight_score numeric(4, 2),
  ADD COLUMN IF NOT EXISTS relationship text,
  ADD COLUMN IF NOT EXISTS reviewer_email text;

CREATE UNIQUE INDEX IF NOT EXISTS peer_reviews_external_ref_unique
  ON public.peer_reviews (learner_user_id, external_reference)
  WHERE external_reference IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.peer_review_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  evidence_record_id uuid REFERENCES public.evidence_records(id) ON DELETE CASCADE,
  project_id text NOT NULL,
  project_name text NOT NULL,
  source text NOT NULL,
  contributor_id text NOT NULL,
  contributor_name text NOT NULL,
  contributor_email text NOT NULL,
  contributor_role text NOT NULL,
  relationship text NOT NULL DEFAULT 'contributor',
  skill_id uuid REFERENCES public.declared_skills(id) ON DELETE SET NULL,
  skill text NOT NULL,
  reviewer_context_id uuid REFERENCES public.reviewer_contexts(id) ON DELETE SET NULL,
  token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'sent',
  expires_at timestamptz NOT NULL,
  completed_review_id uuid REFERENCES public.peer_reviews(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.peer_review_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "peer_review_invites_select_learner" ON public.peer_review_invites
  FOR SELECT TO authenticated
  USING (auth.uid() = learner_user_id);

CREATE POLICY "peer_review_invites_insert_learner" ON public.peer_review_invites
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = learner_user_id);

CREATE POLICY "peer_review_invites_update_learner" ON public.peer_review_invites
  FOR UPDATE TO authenticated
  USING (auth.uid() = learner_user_id);

CREATE POLICY "peer_review_invites_select_reviewer" ON public.peer_review_invites
  FOR SELECT TO authenticated
  USING (
    lower(contributor_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

CREATE POLICY "peer_review_invites_select_institution" ON public.peer_review_invites
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'institution'));

CREATE INDEX IF NOT EXISTS peer_review_invites_learner_idx
  ON public.peer_review_invites (learner_user_id);
CREATE INDEX IF NOT EXISTS peer_review_invites_project_idx
  ON public.peer_review_invites (learner_user_id, project_id);
CREATE INDEX IF NOT EXISTS peer_review_invites_token_idx
  ON public.peer_review_invites (token);
CREATE INDEX IF NOT EXISTS peer_review_invites_status_idx
  ON public.peer_review_invites (learner_user_id, status);

CREATE TRIGGER trg_peer_review_invites_updated_at
  BEFORE UPDATE ON public.peer_review_invites
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Expanded peer_reviews RLS: learner, reviewer (by email), institution
CREATE POLICY "peer_reviews_select_institution" ON public.peer_reviews
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'institution'));

CREATE POLICY "peer_reviews_select_reviewer" ON public.peer_reviews
  FOR SELECT TO authenticated
  USING (
    reviewer_email IS NOT NULL
    AND lower(reviewer_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

CREATE POLICY "review_requests_select_institution" ON public.review_requests
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'institution'));

CREATE POLICY "review_requests_select_reviewer" ON public.review_requests
  FOR SELECT TO authenticated
  USING (
    lower(reviewer_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
