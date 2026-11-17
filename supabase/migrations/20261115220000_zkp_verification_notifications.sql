-- Phase 2: generalized verification requests and in-app notifications.
-- Do not apply this file to hosted Supabase until it is explicitly approved.
-- It does not alter score-threshold proofs, openings, commitments, or proving keys.
-- Practical-score requests continue to live in zkp_score_verification_requests.
-- This table mirrors them for the notification center and later proof categories.
-- Notification text is public. Do not store marks, counts, grades, blinding values, or witnesses.

BEGIN;

CREATE TABLE IF NOT EXISTS public.zkp_verification_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_score_request_id uuid UNIQUE REFERENCES public.zkp_score_verification_requests(id) ON DELETE CASCADE,
  recruiter_user_id uuid NOT NULL REFERENCES auth.users(id),
  learner_user_id uuid NOT NULL REFERENCES auth.users(id),
  recruiter_label text NOT NULL,
  learner_label text NOT NULL,
  category text NOT NULL CHECK (category IN (
    'practical-score',
    'github-activity',
    'moodle-performance',
    'skill-progression'
  )),
  skill_label text NOT NULL,
  policy_label text NOT NULL,
  threshold integer,
  status text NOT NULL CHECK (status IN (
    'pending',
    'approved',
    'generating',
    'verified',
    'failed',
    'unsatisfied',
    'rejected',
    'expired',
    'cancelled'
  )),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT zkp_verification_requests_distinct_parties CHECK (learner_user_id <> recruiter_user_id)
);

CREATE INDEX IF NOT EXISTS zkp_verification_requests_learner_idx
  ON public.zkp_verification_requests (learner_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS zkp_verification_requests_recruiter_idx
  ON public.zkp_verification_requests (recruiter_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.zkp_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL REFERENCES auth.users(id),
  request_id uuid NOT NULL REFERENCES public.zkp_verification_requests(id) ON DELETE CASCADE,
  audience text NOT NULL CHECK (audience IN ('learner', 'recruiter')),
  kind text NOT NULL CHECK (kind IN (
    'request_created',
    'approved',
    'rejected',
    'verified',
    'expired',
    'failed'
  )),
  title text NOT NULL,
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT zkp_notifications_once UNIQUE (request_id, recipient_user_id, kind)
);

CREATE INDEX IF NOT EXISTS zkp_notifications_recipient_idx
  ON public.zkp_notifications (recipient_user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.zkp_notifications_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  learner uuid;
  recruiter uuid;
BEGIN
  SELECT learner_user_id, recruiter_user_id
    INTO learner, recruiter
  FROM public.zkp_verification_requests
  WHERE id = NEW.request_id;

  IF learner IS NULL OR recruiter IS NULL THEN
    RAISE EXCEPTION 'verification request is missing';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.recipient_user_id IS DISTINCT FROM OLD.recipient_user_id
       OR NEW.request_id IS DISTINCT FROM OLD.request_id
       OR NEW.audience IS DISTINCT FROM OLD.audience
       OR NEW.kind IS DISTINCT FROM OLD.kind
       OR NEW.title IS DISTINCT FROM OLD.title
       OR NEW.body IS DISTINCT FROM OLD.body
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.id IS DISTINCT FROM OLD.id
    THEN
      RAISE EXCEPTION 'notification content is immutable';
    END IF;
  END IF;

  IF NEW.audience = 'learner' THEN
    IF NEW.recipient_user_id IS DISTINCT FROM learner OR NEW.kind <> 'request_created' THEN
      RAISE EXCEPTION 'learner notification recipient is invalid';
    END IF;
  ELSIF NEW.audience = 'recruiter' THEN
    IF NEW.recipient_user_id IS DISTINCT FROM recruiter
       OR NEW.kind NOT IN ('approved', 'rejected', 'verified', 'expired', 'failed') THEN
      RAISE EXCEPTION 'recruiter notification recipient is invalid';
    END IF;
  ELSE
    RAISE EXCEPTION 'notification audience is invalid';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zkp_notifications_guard ON public.zkp_notifications;
CREATE TRIGGER zkp_notifications_guard
  BEFORE INSERT OR UPDATE ON public.zkp_notifications
  FOR EACH ROW EXECUTE FUNCTION public.zkp_notifications_guard();

REVOKE ALL ON FUNCTION public.zkp_notifications_guard() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.zkp_notifications REPLICA IDENTITY FULL;

ALTER TABLE public.zkp_verification_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zkp_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS zkp_verification_requests_select_party ON public.zkp_verification_requests;
CREATE POLICY zkp_verification_requests_select_party
  ON public.zkp_verification_requests
  FOR SELECT
  TO authenticated
  USING (auth.uid() = learner_user_id OR auth.uid() = recruiter_user_id);

DROP POLICY IF EXISTS zkp_notifications_select_own ON public.zkp_notifications;
CREATE POLICY zkp_notifications_select_own
  ON public.zkp_notifications
  FOR SELECT
  TO authenticated
  USING (auth.uid() = recipient_user_id);

REVOKE ALL ON public.zkp_verification_requests FROM anon, authenticated;
REVOKE ALL ON public.zkp_notifications FROM anon, authenticated;
GRANT SELECT ON public.zkp_verification_requests TO authenticated;
GRANT SELECT ON public.zkp_notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.zkp_verification_requests TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.zkp_notifications TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'zkp_notifications'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.zkp_notifications;
  END IF;
END $$;

COMMIT;
