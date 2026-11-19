-- Separate invitation lifecycle from SMTP acceptance.
-- Existing rows keep email_delivery_status NULL, which means delivery was not recorded.
-- This does not update or delete any invitation.

ALTER TABLE public.peer_review_invites
  ADD COLUMN IF NOT EXISTS email_delivery_status text;

ALTER TABLE public.peer_review_invites
  DROP CONSTRAINT IF EXISTS peer_review_invites_email_delivery_status_chk;

ALTER TABLE public.peer_review_invites
  ADD CONSTRAINT peer_review_invites_email_delivery_status_chk
  CHECK (
    email_delivery_status IS NULL
    OR email_delivery_status IN ('pending', 'sent', 'failed', 'not_sent')
  );

CREATE UNIQUE INDEX IF NOT EXISTS peer_review_invites_open_contributor_uidx
  ON public.peer_review_invites (learner_user_id, project_id, contributor_id)
  WHERE status IN ('pending', 'sent');
