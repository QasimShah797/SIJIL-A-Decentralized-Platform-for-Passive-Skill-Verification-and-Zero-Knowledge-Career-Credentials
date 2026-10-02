-- Recruiter-scheduled interviews with candidate email delivery tracking

CREATE TABLE IF NOT EXISTS public.scheduled_interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiter_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  candidate_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  candidate_email text NOT NULL,
  candidate_name text NOT NULL,
  recruiter_name text NOT NULL,
  recruiter_company text,
  scheduled_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL,
  mode text NOT NULL,
  location_or_link text NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'scheduled',
  cancelled_at timestamptz,
  email_status text NOT NULL DEFAULT 'not_sent',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scheduled_interviews_duration_check
    CHECK (duration_minutes BETWEEN 15 AND 240),
  CONSTRAINT scheduled_interviews_mode_check
    CHECK (mode IN ('in_person', 'video_call', 'phone')),
  CONSTRAINT scheduled_interviews_status_check
    CHECK (status IN ('scheduled', 'cancelled')),
  CONSTRAINT scheduled_interviews_email_status_check
    CHECK (email_status IN ('not_sent', 'sent', 'failed'))
);

ALTER TABLE public.scheduled_interviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scheduled_interviews_select_participants" ON public.scheduled_interviews;
CREATE POLICY "scheduled_interviews_select_participants"
  ON public.scheduled_interviews
  FOR SELECT TO authenticated
  USING (
    auth.uid() = recruiter_user_id
    OR auth.uid() = candidate_user_id
    OR public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "scheduled_interviews_insert_recruiter" ON public.scheduled_interviews;
CREATE POLICY "scheduled_interviews_insert_recruiter"
  ON public.scheduled_interviews
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = recruiter_user_id
    AND (
      public.has_role(auth.uid(), 'recruiter')
      OR public.has_role(auth.uid(), 'admin')
    )
  );

DROP POLICY IF EXISTS "scheduled_interviews_update_recruiter" ON public.scheduled_interviews;
CREATE POLICY "scheduled_interviews_update_recruiter"
  ON public.scheduled_interviews
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

CREATE INDEX IF NOT EXISTS scheduled_interviews_recruiter_idx
  ON public.scheduled_interviews (recruiter_user_id, scheduled_at DESC);

CREATE INDEX IF NOT EXISTS scheduled_interviews_candidate_idx
  ON public.scheduled_interviews (candidate_user_id, scheduled_at DESC);

CREATE INDEX IF NOT EXISTS scheduled_interviews_status_idx
  ON public.scheduled_interviews (recruiter_user_id, status);

DROP TRIGGER IF EXISTS trg_scheduled_interviews_updated_at ON public.scheduled_interviews;
CREATE TRIGGER trg_scheduled_interviews_updated_at
  BEFORE UPDATE ON public.scheduled_interviews
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
