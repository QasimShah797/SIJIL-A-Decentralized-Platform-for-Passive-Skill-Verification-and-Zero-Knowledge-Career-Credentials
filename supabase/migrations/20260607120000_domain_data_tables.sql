-- Domain tables: replace hardcoded mock data with persistent storage

ALTER TABLE public.learner_profiles
  ADD COLUMN IF NOT EXISTS holder_did text,
  ADD COLUMN IF NOT EXISTS batch text;

-- Declared skills
CREATE TABLE IF NOT EXISTS public.declared_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  domain text NOT NULL DEFAULT 'General',
  description text DEFAULT '',
  status text NOT NULL DEFAULT 'Skill Claimed',
  last_related_activity_at timestamptz,
  last_credential_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.declared_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "skills_select_own" ON public.declared_skills
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "skills_select_recruiter_institution" ON public.declared_skills
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'recruiter') OR public.has_role(auth.uid(), 'institution')
  );
CREATE POLICY "skills_insert_own" ON public.declared_skills
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "skills_update_own" ON public.declared_skills
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "skills_delete_own" ON public.declared_skills
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS declared_skills_user_idx ON public.declared_skills (user_id);

-- Verifiable credentials
CREATE TABLE IF NOT EXISTS public.credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credential_uri text NOT NULL,
  name text NOT NULL,
  credential_types text[] NOT NULL DEFAULT ARRAY['VerifiableCredential'],
  issuer_name text NOT NULL,
  issuer_did text NOT NULL,
  holder_did text NOT NULL,
  valid_from timestamptz NOT NULL DEFAULT now(),
  verification_status text NOT NULL DEFAULT 'Pending',
  attestation_status text NOT NULL DEFAULT 'Pending',
  supporting_records int NOT NULL DEFAULT 0,
  skill_name text,
  proof jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, credential_uri)
);
ALTER TABLE public.credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "credentials_select_own" ON public.credentials
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "credentials_select_recruiter" ON public.credentials
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'recruiter'));
CREATE POLICY "credentials_insert_own" ON public.credentials
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "credentials_update_own" ON public.credentials
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "credentials_delete_own" ON public.credentials
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS credentials_user_idx ON public.credentials (user_id);

-- Attestations (institution workflow)
CREATE TABLE IF NOT EXISTS public.attestations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_id uuid REFERENCES public.declared_skills(id) ON DELETE SET NULL,
  skill_name text NOT NULL,
  student_name text,
  student_id text,
  program text,
  batch text,
  email text,
  validation_result text NOT NULL DEFAULT 'Pending',
  validation_status text NOT NULL DEFAULT 'Under Review',
  last_evaluated date,
  evidence_count int NOT NULL DEFAULT 0,
  review_count int NOT NULL DEFAULT 0,
  readiness text NOT NULL DEFAULT 'Pending Evidence',
  status text NOT NULL DEFAULT 'Pending Attestation',
  submitted_at date,
  remarks text,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  task jsonb,
  reviews jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.attestations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attestations_select_learner" ON public.attestations
  FOR SELECT TO authenticated USING (auth.uid() = learner_user_id);
CREATE POLICY "attestations_select_institution" ON public.attestations
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'institution'));
CREATE POLICY "attestations_insert_learner" ON public.attestations
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = learner_user_id);
CREATE POLICY "attestations_update_institution" ON public.attestations
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'institution'));

CREATE INDEX IF NOT EXISTS attestations_learner_idx ON public.attestations (learner_user_id);
CREATE INDEX IF NOT EXISTS attestations_status_idx ON public.attestations (status);

-- Peer reviews
CREATE TABLE IF NOT EXISTS public.peer_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reviewer_name text NOT NULL,
  reviewer_role text NOT NULL,
  source text NOT NULL,
  origin text NOT NULL DEFAULT 'SIJIL',
  skill text NOT NULL,
  project_id text,
  project_name text,
  evidence_label text NOT NULL DEFAULT '',
  evidence_url text,
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text NOT NULL DEFAULT '',
  recommendation text,
  review_date timestamptz NOT NULL DEFAULT now(),
  context_status text NOT NULL DEFAULT 'Context Pending',
  contributor_verification text,
  trust_weight text NOT NULL DEFAULT 'Medium Trust',
  imported boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.peer_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "peer_reviews_select_own" ON public.peer_reviews
  FOR SELECT TO authenticated USING (auth.uid() = learner_user_id);
CREATE POLICY "peer_reviews_select_recruiter" ON public.peer_reviews
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'recruiter'));
CREATE POLICY "peer_reviews_insert_own" ON public.peer_reviews
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = learner_user_id);

CREATE INDEX IF NOT EXISTS peer_reviews_learner_idx ON public.peer_reviews (learner_user_id);

-- Review invitations
CREATE TABLE IF NOT EXISTS public.review_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id text NOT NULL,
  project_name text NOT NULL,
  source text NOT NULL,
  contributor_id text NOT NULL,
  contributor_name text NOT NULL,
  contributor_email text,
  contributor_role text NOT NULL,
  learner_name text NOT NULL,
  skill text NOT NULL,
  status text NOT NULL DEFAULT 'Sent',
  sent_at timestamptz NOT NULL DEFAULT now(),
  completed_review_id uuid REFERENCES public.peer_reviews(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.review_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "review_invitations_select_own" ON public.review_invitations
  FOR SELECT TO authenticated USING (auth.uid() = learner_user_id);
CREATE POLICY "review_invitations_insert_own" ON public.review_invitations
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = learner_user_id);
CREATE POLICY "review_invitations_update_own" ON public.review_invitations
  FOR UPDATE TO authenticated USING (auth.uid() = learner_user_id);

-- Practical task attempts
CREATE TABLE IF NOT EXISTS public.practical_attempts (
  skill_id uuid PRIMARY KEY REFERENCES public.declared_skills(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attempt_id text NOT NULL,
  started_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  duration_minutes int NOT NULL,
  status text NOT NULL,
  submission text NOT NULL DEFAULT '',
  credential_sync_snapshot timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.practical_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attempts_select_own" ON public.practical_attempts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "attempts_insert_own" ON public.practical_attempts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "attempts_update_own" ON public.practical_attempts
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Selective disclosure presentations
CREATE TABLE IF NOT EXISTS public.presentations (
  token text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credential_id uuid NOT NULL REFERENCES public.credentials(id) ON DELETE CASCADE,
  candidate_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient text NOT NULL,
  recipient_did text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked boolean NOT NULL DEFAULT false,
  disclosed_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  hidden_fields text[] NOT NULL DEFAULT ARRAY[]::text[],
  proof jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE public.presentations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "presentations_select_own" ON public.presentations
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "presentations_select_recruiter" ON public.presentations
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'recruiter'));
CREATE POLICY "presentations_insert_own" ON public.presentations
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "presentations_update_own" ON public.presentations
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Recruiters can browse verified learners
CREATE POLICY "recruiter read learners" ON public.learner_profiles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'recruiter'));

CREATE POLICY "institution read learners" ON public.learner_profiles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'institution'));
