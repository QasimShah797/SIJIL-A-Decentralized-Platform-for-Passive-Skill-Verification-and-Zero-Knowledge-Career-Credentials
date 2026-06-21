-- Context review flow: review requests, reviewer contexts, extended peer_reviews

ALTER TABLE public.peer_reviews
  ADD COLUMN IF NOT EXISTS evidence_record_id uuid REFERENCES public.evidence_records(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS skill_id uuid REFERENCES public.declared_skills(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_type text,
  ADD COLUMN IF NOT EXISTS external_reference text,
  ADD COLUMN IF NOT EXISTS review_request_id uuid;

CREATE INDEX IF NOT EXISTS peer_reviews_evidence_idx
  ON public.peer_reviews (evidence_record_id);
CREATE INDEX IF NOT EXISTS peer_reviews_skill_idx
  ON public.peer_reviews (skill_id);

CREATE TABLE IF NOT EXISTS public.reviewer_contexts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_record_id uuid NOT NULL REFERENCES public.evidence_records(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reviewer_name text NOT NULL,
  reviewer_email text,
  reviewer_login text,
  context_role text NOT NULL DEFAULT 'Project Collaborator',
  source text NOT NULL DEFAULT 'GitHub',
  external_ref text,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (evidence_record_id, reviewer_login)
);

CREATE TABLE IF NOT EXISTS public.review_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  evidence_record_id uuid NOT NULL REFERENCES public.evidence_records(id) ON DELETE CASCADE,
  skill_id uuid REFERENCES public.declared_skills(id) ON DELETE SET NULL,
  reviewer_context_id uuid REFERENCES public.reviewer_contexts(id) ON DELETE SET NULL,
  reviewer_name text NOT NULL,
  reviewer_email text NOT NULL,
  reviewer_context_role text NOT NULL,
  context_source text NOT NULL,
  token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'sent',
  expires_at timestamptz NOT NULL,
  completed_review_id uuid REFERENCES public.peer_reviews(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.peer_reviews
  ADD CONSTRAINT peer_reviews_review_request_fk
  FOREIGN KEY (review_request_id) REFERENCES public.review_requests(id) ON DELETE SET NULL;

ALTER TABLE public.reviewer_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reviewer_contexts_select_own" ON public.reviewer_contexts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "reviewer_contexts_insert_own" ON public.reviewer_contexts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "reviewer_contexts_update_own" ON public.reviewer_contexts
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "review_requests_select_own" ON public.review_requests
  FOR SELECT TO authenticated USING (auth.uid() = learner_user_id);
CREATE POLICY "review_requests_insert_own" ON public.review_requests
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = learner_user_id);
CREATE POLICY "review_requests_update_own" ON public.review_requests
  FOR UPDATE TO authenticated USING (auth.uid() = learner_user_id);

CREATE INDEX IF NOT EXISTS reviewer_contexts_evidence_idx
  ON public.reviewer_contexts (evidence_record_id);
CREATE INDEX IF NOT EXISTS review_requests_evidence_idx
  ON public.review_requests (evidence_record_id);
CREATE INDEX IF NOT EXISTS review_requests_token_idx
  ON public.review_requests (token);
CREATE INDEX IF NOT EXISTS review_requests_learner_idx
  ON public.review_requests (learner_user_id);

CREATE TRIGGER trg_review_requests_updated_at
  BEFORE UPDATE ON public.review_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
