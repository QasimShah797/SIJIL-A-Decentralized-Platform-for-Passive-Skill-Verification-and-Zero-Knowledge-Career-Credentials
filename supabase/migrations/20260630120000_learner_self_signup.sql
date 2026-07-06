-- Phase 1: learner self-signup profile fields

ALTER TABLE public.learner_profiles
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS graduation_year integer;

COMMENT ON COLUMN public.learner_profiles.date_of_birth IS 'Learner date of birth (self-signup onboarding)';
COMMENT ON COLUMN public.learner_profiles.gender IS 'Learner gender (self-signup onboarding)';
COMMENT ON COLUMN public.learner_profiles.country IS 'Learner country of residence';
COMMENT ON COLUMN public.learner_profiles.city IS 'Learner city of residence';
COMMENT ON COLUMN public.learner_profiles.graduation_year IS 'Expected or actual graduation year (optional)';
