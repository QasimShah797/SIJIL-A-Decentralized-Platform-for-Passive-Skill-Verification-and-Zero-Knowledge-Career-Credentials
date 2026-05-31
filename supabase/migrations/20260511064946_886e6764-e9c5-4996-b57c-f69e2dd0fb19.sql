
-- 1. Extend enums (cannot drop existing values; just add new ones)
ALTER TYPE public.recruiter_status ADD VALUE IF NOT EXISTS 'work_email_verified';
ALTER TYPE public.recruiter_status ADD VALUE IF NOT EXISTS 'limited';
ALTER TYPE public.recruiter_status ADD VALUE IF NOT EXISTS 'company_domain_verified';

ALTER TYPE public.institution_status ADD VALUE IF NOT EXISTS 'email_pending';
ALTER TYPE public.institution_status ADD VALUE IF NOT EXISTS 'email_verified';
ALTER TYPE public.institution_status ADD VALUE IF NOT EXISTS 'domain_not_recognized';
ALTER TYPE public.institution_status ADD VALUE IF NOT EXISTS 'needs_review';

-- 2. New learner_status enum
DO $$ BEGIN
  CREATE TYPE public.learner_status AS ENUM ('email_pending', 'verified');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE public.learner_profiles
  ADD COLUMN IF NOT EXISTS status public.learner_status NOT NULL DEFAULT 'email_pending';

-- 3. Restructure institution_profiles for self-signup
ALTER TABLE public.institution_profiles
  ADD COLUMN IF NOT EXISTS official_email text,
  ADD COLUMN IF NOT EXISTS contact_person_name text,
  ADD COLUMN IF NOT EXISTS contact_person_role text,
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS domain text;

-- Replace policies on institution_profiles
DROP POLICY IF EXISTS "admin manage institutions" ON public.institution_profiles;
DROP POLICY IF EXISTS "institution own select" ON public.institution_profiles;

CREATE POLICY "institution own select"
  ON public.institution_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "institution own insert"
  ON public.institution_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "institution own update"
  ON public.institution_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- 4. Drop admin-only policies on other tables
DROP POLICY IF EXISTS "admin read learners" ON public.learner_profiles;
DROP POLICY IF EXISTS "admin read recruiters" ON public.recruiter_profiles;
DROP POLICY IF EXISTS "admin update recruiters" ON public.recruiter_profiles;
DROP POLICY IF EXISTS "admin read requests" ON public.institution_access_requests;
DROP POLICY IF EXISTS "admin update requests" ON public.institution_access_requests;

-- 5. Drop the recruiter verification guard (was admin-only); decentralize via trigger
DROP FUNCTION IF EXISTS public.guard_recruiter_verification() CASCADE;

-- 6. Update user_roles insert policy to allow institution role too
DROP POLICY IF EXISTS "users insert own non-admin role" ON public.user_roles;
CREATE POLICY "users insert own non-admin role"
  ON public.user_roles FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND role IN ('learner'::app_role, 'recruiter'::app_role, 'institution'::app_role)
  );

-- 7. Trusted institution domains
CREATE TABLE IF NOT EXISTS public.trusted_institution_domains (
  domain text PRIMARY KEY,
  institution_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.trusted_institution_domains ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone can read trusted domains" ON public.trusted_institution_domains;
CREATE POLICY "anyone can read trusted domains"
  ON public.trusted_institution_domains FOR SELECT
  TO anon, authenticated
  USING (true);

INSERT INTO public.trusted_institution_domains (domain, institution_name) VALUES
  ('cust.edu.pk', 'Capital University of Science and Technology'),
  ('nust.edu.pk', 'National University of Sciences and Technology'),
  ('comsats.edu.pk', 'COMSATS University Islamabad'),
  ('nu.edu.pk', 'National University of Computer and Emerging Sciences')
ON CONFLICT (domain) DO NOTHING;

-- 8. Helper functions for email-domain rules
CREATE OR REPLACE FUNCTION public.is_personal_email(_email text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT lower(split_part(_email, '@', 2)) IN (
    'gmail.com','yahoo.com','outlook.com','hotmail.com','icloud.com',
    'live.com','aol.com','proton.me','protonmail.com','msn.com','yahoo.co.uk'
  )
$$;

CREATE OR REPLACE FUNCTION public.is_trusted_institution_email(_email text)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trusted_institution_domains
    WHERE domain = lower(split_part(_email, '@', 2))
  )
$$;

-- 9. Trigger on auth.users email confirmation -> auto-promote statuses
CREATE OR REPLACE FUNCTION public.handle_email_confirmation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL
     AND (OLD.email_confirmed_at IS NULL OR OLD.email_confirmed_at <> NEW.email_confirmed_at) THEN

    -- Learners → verified
    UPDATE public.learner_profiles
       SET status = 'verified'
     WHERE user_id = NEW.id;

    -- Recruiters → work_email_verified (or company_domain_verified if non-personal)
    UPDATE public.recruiter_profiles
       SET verification_status = CASE
         WHEN public.is_personal_email(work_email) THEN 'limited'::recruiter_status
         ELSE 'work_email_verified'::recruiter_status
       END,
       verified_at = now()
     WHERE user_id = NEW.id;

    -- Institutions → email_verified if trusted, else needs_review
    UPDATE public.institution_profiles
       SET status = CASE
         WHEN public.is_trusted_institution_email(coalesce(official_email, '')) THEN 'email_verified'::institution_status
         ELSE 'needs_review'::institution_status
       END
     WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_email_confirmed ON auth.users;
CREATE TRIGGER on_auth_email_confirmed
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_email_confirmation();
