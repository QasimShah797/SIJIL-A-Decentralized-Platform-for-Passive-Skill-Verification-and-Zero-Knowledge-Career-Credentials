-- Run in Supabase Dashboard → SQL Editor AFTER creating the auth user:
--   Authentication → Users → Add user
--   Email: institution@cust.edu.pk
--   Password: CUST@Sijil2026!
--   ✓ Auto Confirm User
--
-- Or use: cd backend && npm run seed:institution (preferred; uses service role).

ALTER TYPE public.institution_status ADD VALUE IF NOT EXISTS 'active';

INSERT INTO public.profiles (id, display_name)
SELECT id, 'Capital University of Science & Technology'
FROM auth.users
WHERE email = 'institution@cust.edu.pk'
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name;

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'institution'::public.app_role
FROM auth.users
WHERE email = 'institution@cust.edu.pk'
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.institution_profiles (
  user_id,
  institution_name,
  official_email,
  contact_email,
  domain,
  status
)
SELECT
  id,
  'Capital University of Science & Technology',
  'institution@cust.edu.pk',
  'institution@cust.edu.pk',
  'cust.edu.pk',
  'active'::public.institution_status
FROM auth.users
WHERE email = 'institution@cust.edu.pk'
ON CONFLICT (user_id) DO UPDATE SET
  institution_name = EXCLUDED.institution_name,
  official_email = EXCLUDED.official_email,
  contact_email = EXCLUDED.contact_email,
  domain = EXCLUDED.domain,
  status = 'active'::public.institution_status;

-- Short name (CUST) is stored on the auth user as user_metadata.institution_short_name
-- when using: cd backend && npm run seed:institution
