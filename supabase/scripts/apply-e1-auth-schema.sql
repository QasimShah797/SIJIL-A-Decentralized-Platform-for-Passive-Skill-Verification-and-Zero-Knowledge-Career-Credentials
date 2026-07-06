-- =============================================================================
-- SIJIL E1-US1 Authentication Schema (Phase 1 + Phase 2)
-- =============================================================================
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- Project:  nhzvtqpplfruzocframc (remote — no Docker, no supabase db push required)
-- Safe to re-run (idempotent).
--
-- Fixes errors like:
--   column learner_profiles.university_email does not exist
--   relation student_activation_tokens does not exist
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Phase 1: Institution login uses status = active
-- -----------------------------------------------------------------------------
ALTER TYPE public.institution_status ADD VALUE IF NOT EXISTS 'active';

-- -----------------------------------------------------------------------------
-- Phase 2: Institution-provisioned students (learner_profiles extensions)
-- -----------------------------------------------------------------------------
ALTER TABLE public.learner_profiles
  ADD COLUMN IF NOT EXISTS institution_id uuid REFERENCES public.institution_profiles(user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS university_email text,
  ADD COLUMN IF NOT EXISTS city_country text,
  ADD COLUMN IF NOT EXISTS career_goal text,
  ADD COLUMN IF NOT EXISTS skills_summary text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS account_activated_at timestamptz;

-- Registration number unique per institution (student_id column = registration #)
CREATE UNIQUE INDEX IF NOT EXISTS learner_profiles_institution_reg_idx
  ON public.learner_profiles (institution_id, student_id)
  WHERE institution_id IS NOT NULL AND student_id IS NOT NULL;

-- University email unique globally among provisioned students
CREATE UNIQUE INDEX IF NOT EXISTS learner_profiles_university_email_idx
  ON public.learner_profiles (lower(university_email))
  WHERE university_email IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Phase 2: Student activation tokens (hashed; backend service role only)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_activation_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES public.institution_profiles(user_id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS student_activation_tokens_hash_idx
  ON public.student_activation_tokens (token_hash);

CREATE INDEX IF NOT EXISTS student_activation_tokens_user_idx
  ON public.student_activation_tokens (user_id);

ALTER TABLE public.student_activation_tokens ENABLE ROW LEVEL SECURITY;

-- No RLS policies for clients — only backend service role accesses this table.

-- Phase 3: optional profile avatars (complete-profile)
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-avatars', 'profile-avatars', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "profile_avatars_select" ON storage.objects;
CREATE POLICY "profile_avatars_select"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'profile-avatars');

DROP POLICY IF EXISTS "profile_avatars_insert_own" ON storage.objects;
CREATE POLICY "profile_avatars_insert_own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'profile-avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "profile_avatars_update_own" ON storage.objects;
CREATE POLICY "profile_avatars_update_own"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'profile-avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "profile_avatars_delete_own" ON storage.objects;
CREATE POLICY "profile_avatars_delete_own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'profile-avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- -----------------------------------------------------------------------------
-- Verify (optional — check results in query output)
-- -----------------------------------------------------------------------------
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'learner_profiles'
  AND column_name IN (
    'institution_id', 'department', 'university_email',
    'account_activated_at', 'city_country', 'career_goal', 'skills_summary', 'avatar_url'
  )
ORDER BY column_name;

SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'student_activation_tokens'
) AS student_activation_tokens_exists;

SELECT enumlabel AS institution_status_value
FROM pg_enum e
JOIN pg_type t ON e.enumtypid = t.oid
WHERE t.typname = 'institution_status'
  AND enumlabel = 'active';
