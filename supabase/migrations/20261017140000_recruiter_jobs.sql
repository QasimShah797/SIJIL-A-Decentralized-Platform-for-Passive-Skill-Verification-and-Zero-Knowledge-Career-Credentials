-- Open roles a recruiter is hiring for, plus per-candidate decisions.

CREATE TABLE IF NOT EXISTS public.recruiter_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiter_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  seats integer NOT NULL DEFAULT 1,
  skills text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'open',
  decisions jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recruiter_jobs_title_check CHECK (char_length(btrim(title)) BETWEEN 2 AND 120),
  CONSTRAINT recruiter_jobs_seats_check CHECK (seats BETWEEN 1 AND 50),
  CONSTRAINT recruiter_jobs_status_check CHECK (status IN ('open', 'closed'))
);

ALTER TABLE public.recruiter_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recruiter_jobs_select_owner" ON public.recruiter_jobs;
CREATE POLICY "recruiter_jobs_select_owner"
  ON public.recruiter_jobs
  FOR SELECT TO authenticated
  USING (
    auth.uid() = recruiter_user_id
    OR public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "recruiter_jobs_insert_recruiter" ON public.recruiter_jobs;
CREATE POLICY "recruiter_jobs_insert_recruiter"
  ON public.recruiter_jobs
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = recruiter_user_id
    AND (
      public.has_role(auth.uid(), 'recruiter')
      OR public.has_role(auth.uid(), 'admin')
    )
  );

DROP POLICY IF EXISTS "recruiter_jobs_update_recruiter" ON public.recruiter_jobs;
CREATE POLICY "recruiter_jobs_update_recruiter"
  ON public.recruiter_jobs
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = recruiter_user_id
    AND (
      public.has_role(auth.uid(), 'recruiter')
      OR public.has_role(auth.uid(), 'admin')
    )
  )
  WITH CHECK (
    auth.uid() = recruiter_user_id
    AND (
      public.has_role(auth.uid(), 'recruiter')
      OR public.has_role(auth.uid(), 'admin')
    )
  );

DROP POLICY IF EXISTS "recruiter_jobs_delete_recruiter" ON public.recruiter_jobs;
CREATE POLICY "recruiter_jobs_delete_recruiter"
  ON public.recruiter_jobs
  FOR DELETE TO authenticated
  USING (
    auth.uid() = recruiter_user_id
    AND (
      public.has_role(auth.uid(), 'recruiter')
      OR public.has_role(auth.uid(), 'admin')
    )
  );

CREATE INDEX IF NOT EXISTS recruiter_jobs_owner_idx
  ON public.recruiter_jobs (recruiter_user_id, created_at DESC);
