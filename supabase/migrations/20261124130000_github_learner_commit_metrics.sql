ALTER TABLE public.github_repos
  ADD COLUMN learner_commit_count integer CHECK (learner_commit_count >= 0),
  ADD COLUMN learner_last_commit_at timestamptz;

CREATE FUNCTION public.guard_github_repos_learner_metrics()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND (NEW.learner_commit_count IS DISTINCT FROM OLD.learner_commit_count
       OR NEW.learner_last_commit_at IS DISTINCT FROM OLD.learner_last_commit_at) THEN
    RAISE EXCEPTION 'Learner commit metrics can only be written by the backend';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_github_repos_learner_metrics
  BEFORE UPDATE ON public.github_repos
  FOR EACH ROW EXECUTE FUNCTION public.guard_github_repos_learner_metrics();

NOTIFY pgrst, 'reload schema';
