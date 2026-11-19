-- Store the IANA timezone selected when an interview is scheduled.
-- Existing rows are left NULL. The application displays those as UTC,
-- which matches the previous email format. This statement does not
-- rewrite scheduled times, notes, or email status.

ALTER TABLE public.scheduled_interviews
  ADD COLUMN IF NOT EXISTS time_zone text;

ALTER TABLE public.scheduled_interviews
  DROP CONSTRAINT IF EXISTS scheduled_interviews_time_zone_len;

ALTER TABLE public.scheduled_interviews
  ADD CONSTRAINT scheduled_interviews_time_zone_len
  CHECK (time_zone IS NULL OR char_length(btrim(time_zone)) BETWEEN 1 AND 100);
