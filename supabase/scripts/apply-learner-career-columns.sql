-- Run in Supabase Dashboard → SQL Editor.
-- Adds learner career/profile columns used by My Profile and recruiter candidate cards.

ALTER TABLE public.learner_profiles
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS career_goal text,
  ADD COLUMN IF NOT EXISTS skills_summary text,
  ADD COLUMN IF NOT EXISTS avatar_url text;

NOTIFY pgrst, 'reload schema';
