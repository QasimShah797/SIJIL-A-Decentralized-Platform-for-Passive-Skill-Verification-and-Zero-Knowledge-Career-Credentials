-- Secure peer review submission columns (invite-bound reviews)

ALTER TABLE public.peer_reviews
  ADD COLUMN IF NOT EXISTS competency_name text,
  ADD COLUMN IF NOT EXISTS competency_domain text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS review_text text,
  ADD COLUMN IF NOT EXISTS decision text,
  ADD COLUMN IF NOT EXISTS reviewer_confidence int,
  ADD COLUMN IF NOT EXISTS evidence_package jsonb,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewer_email text,
  ADD COLUMN IF NOT EXISTS reviewer_github_username text,
  ADD COLUMN IF NOT EXISTS contributor_verification jsonb,
  ADD COLUMN IF NOT EXISTS verification_status text,
  ADD COLUMN IF NOT EXISTS invitation_id uuid REFERENCES public.review_invitations(id) ON DELETE SET NULL;

-- Relax legacy NOT NULL constraints so secure-only inserts succeed
ALTER TABLE public.peer_reviews
  ALTER COLUMN reviewer_name DROP NOT NULL,
  ALTER COLUMN reviewer_role DROP NOT NULL,
  ALTER COLUMN source DROP NOT NULL,
  ALTER COLUMN skill DROP NOT NULL,
  ALTER COLUMN rating DROP NOT NULL,
  ALTER COLUMN comment DROP NOT NULL;

ALTER TABLE public.peer_reviews
  ALTER COLUMN reviewer_name SET DEFAULT 'Reviewer',
  ALTER COLUMN reviewer_role SET DEFAULT 'Project Collaborator',
  ALTER COLUMN source SET DEFAULT 'github',
  ALTER COLUMN skill SET DEFAULT '',
  ALTER COLUMN rating SET DEFAULT 3,
  ALTER COLUMN comment SET DEFAULT '';

CREATE INDEX IF NOT EXISTS peer_reviews_invitation_idx
  ON public.peer_reviews (invitation_id);
