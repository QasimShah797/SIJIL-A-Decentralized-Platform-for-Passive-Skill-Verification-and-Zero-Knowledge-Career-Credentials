-- Store resolved GitHub contributor emails for peer review invitations.
ALTER TABLE public.github_repo_contributors
  ADD COLUMN IF NOT EXISTS contributor_email text;

CREATE INDEX IF NOT EXISTS ghc_contributor_email_idx
  ON public.github_repo_contributors (user_id, repo_id, contributor_login)
  WHERE contributor_email IS NOT NULL;
