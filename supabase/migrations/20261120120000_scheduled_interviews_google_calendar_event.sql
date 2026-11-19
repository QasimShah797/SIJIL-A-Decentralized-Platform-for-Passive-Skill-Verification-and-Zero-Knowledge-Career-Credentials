-- Phase 2: persist Google Calendar event id for SIJIL-managed Meet interviews.
-- DO NOT apply to hosted Supabase without explicit approval.
-- Meet join URL continues to live in location_or_link; this column enables cancel/idempotency.

alter table public.scheduled_interviews
  add column if not exists google_calendar_event_id text;

create index if not exists scheduled_interviews_google_calendar_event_id_idx
  on public.scheduled_interviews (google_calendar_event_id)
  where google_calendar_event_id is not null;

comment on column public.scheduled_interviews.google_calendar_event_id is
  'Google Calendar event id created via the SIJIL admin Calendar connection; null for manual locations.';
