-- Learner onboarding: username at signup, 3-step profile completion after account creation

ALTER TABLE public.learner_profiles
  ALTER COLUMN first_name DROP NOT NULL,
  ALTER COLUMN last_name DROP NOT NULL;

ALTER TABLE public.learner_profiles
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS portfolio_url text,
  ADD COLUMN IF NOT EXISTS batch text,
  ADD COLUMN IF NOT EXISTS holder_did text,
  ADD COLUMN IF NOT EXISTS profile_completed boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS learner_profiles_username_lower_idx
  ON public.learner_profiles (lower(username))
  WHERE username IS NOT NULL;

-- Existing learners who already filled their names are treated as complete
UPDATE public.learner_profiles
SET profile_completed = true
WHERE profile_completed = false
  AND coalesce(trim(first_name), '') <> ''
  AND coalesce(trim(last_name), '') <> ''
  AND coalesce(trim(institution_name), '') <> ''
  AND coalesce(trim(program), '') <> ''
  AND coalesce(trim(student_id), '') <> '';
