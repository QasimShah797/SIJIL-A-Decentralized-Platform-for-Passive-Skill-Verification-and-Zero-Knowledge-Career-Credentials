-- Run in Supabase Dashboard AFTER creating the auth user.
--
-- Step 1 — Authentication → Users → Add user
--   Email:    recruiter@yourcompany.com
--   Password: YourSecurePassword123!
--   ✓ Auto Confirm User
--
-- Step 2 — Run this SQL (edit email and profile fields below)

INSERT INTO public.profiles (id, display_name)
SELECT id, 'Jane Recruiter'
FROM auth.users
WHERE email = 'recruiter@yourcompany.com'
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name;

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'recruiter'::public.app_role
FROM auth.users
WHERE email = 'recruiter@yourcompany.com'
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.recruiter_profiles (
  user_id,
  full_name,
  work_email,
  company_name,
  job_title,
  verification_status
)
SELECT
  id,
  'Jane Recruiter',
  'recruiter@yourcompany.com',
  'Your Company Ltd',
  'Talent Acquisition Lead',
  'verified'::public.recruiter_status
FROM auth.users
WHERE email = 'recruiter@yourcompany.com'
ON CONFLICT (user_id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  work_email = EXCLUDED.work_email,
  company_name = EXCLUDED.company_name,
  job_title = EXCLUDED.job_title,
  verification_status = EXCLUDED.verification_status;

-- Step 3 — Sign in at /login/recruiter with the email and password from Step 1.
