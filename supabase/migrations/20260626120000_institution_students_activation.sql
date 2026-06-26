-- Institution-created students, activation tokens, and extended learner profile fields

ALTER TABLE public.learner_profiles
  ADD COLUMN IF NOT EXISTS institution_id uuid REFERENCES public.institution_profiles(user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS university_email text,
  ADD COLUMN IF NOT EXISTS city_country text,
  ADD COLUMN IF NOT EXISTS career_goal text,
  ADD COLUMN IF NOT EXISTS skills_summary text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS account_activated_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS learner_profiles_institution_reg_idx
  ON public.learner_profiles (institution_id, student_id)
  WHERE institution_id IS NOT NULL AND student_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS learner_profiles_university_email_idx
  ON public.learner_profiles (lower(university_email))
  WHERE university_email IS NOT NULL;

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

-- No client policies — backend service role only

-- Profile avatars storage bucket
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
