-- SIJIL: Create recruiter auth user + role + profile in one run.
-- Paste into Supabase Dashboard → SQL Editor → Run
--
-- Email:    recruiter123@cust.edu.pk
-- Password: cust123
-- Sign in:  /login/recruiter

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_email text := 'recruiter123@cust.edu.pk';
  v_password text := 'cust123';
  v_full_name text := 'Recruiter CUST';
  v_company text := 'Capital University of Science & Technology';
  v_job_title text := 'Recruiter';
  v_user_id uuid;
  v_instance_id uuid;
BEGIN
  SELECT COALESCE(
    (SELECT instance_id FROM auth.users LIMIT 1),
    '00000000-0000-0000-0000-000000000000'::uuid
  ) INTO v_instance_id;

  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(v_email);

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();

    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      is_super_admin
    ) VALUES (
      v_instance_id,
      v_user_id,
      'authenticated',
      'authenticated',
      v_email,
      crypt(v_password, gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', v_full_name),
      now(),
      now(),
      '',
      false
    );

    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      v_user_id,
      jsonb_build_object(
        'sub', v_user_id::text,
        'email', v_email,
        'email_verified', true,
        'provider', 'email'
      ),
      'email',
      v_user_id::text,
      now(),
      now(),
      now()
    );
  ELSE
    UPDATE auth.users
    SET
      encrypted_password = crypt(v_password, gen_salt('bf')),
      email_confirmed_at = COALESCE(email_confirmed_at, now()),
      updated_at = now()
    WHERE id = v_user_id;
  END IF;

  INSERT INTO public.profiles (id, display_name)
  VALUES (v_user_id, v_full_name)
  ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'recruiter'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.recruiter_profiles (
    user_id,
    full_name,
    work_email,
    company_name,
    job_title,
    verification_status
  ) VALUES (
    v_user_id,
    v_full_name,
    v_email,
    v_company,
    v_job_title,
    'verified'::public.recruiter_status
  )
  ON CONFLICT (user_id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    work_email = EXCLUDED.work_email,
    company_name = EXCLUDED.company_name,
    job_title = EXCLUDED.job_title,
    verification_status = EXCLUDED.verification_status;

  RAISE NOTICE 'Recruiter ready: % (user_id: %)', v_email, v_user_id;
END $$;
