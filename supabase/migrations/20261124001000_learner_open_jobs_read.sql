-- Learners can see open recruiter jobs so they can share matching competencies.
DROP POLICY IF EXISTS "recruiter_jobs_select_open_learners" ON public.recruiter_jobs;
CREATE POLICY "recruiter_jobs_select_open_learners"
  ON public.recruiter_jobs
  FOR SELECT
  TO authenticated
  USING (
    status = 'open'
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'learner'
    )
  );
