-- Email delivery tracking for secure review invitations

ALTER TABLE public.review_invitations
  ADD COLUMN IF NOT EXISTS email_status text DEFAULT 'not_sent',
  ADD COLUMN IF NOT EXISTS error_message text;
