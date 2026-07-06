-- Remove auth provisioning artifacts only (safe cleanup before auth rebuild).
-- Does NOT touch auth.users, user_roles, profiles, or business data tables.

DROP TABLE IF EXISTS public.student_activation_tokens;

-- Optional: profile avatars bucket from activation onboarding (recreated in rebuild if needed)
DELETE FROM storage.objects WHERE bucket_id = 'profile-avatars';
DELETE FROM storage.buckets WHERE id = 'profile-avatars';
