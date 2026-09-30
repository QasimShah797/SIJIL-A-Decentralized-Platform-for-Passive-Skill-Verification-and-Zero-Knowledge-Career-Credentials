-- One app role per user. Drop the composite unique (user_id, role) after
-- keeping the highest-privilege row so a learner cannot also be a recruiter.

DELETE FROM public.user_roles ur
USING (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY
        CASE role::text
          WHEN 'admin' THEN 1
          WHEN 'reviewer' THEN 2
          WHEN 'institution' THEN 3
          WHEN 'recruiter' THEN 4
          WHEN 'learner' THEN 5
          ELSE 6
        END,
        created_at ASC
    ) AS rn
  FROM public.user_roles
) ranked
WHERE ur.id = ranked.id
  AND ranked.rn > 1;

ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_roles_user_id_key'
      AND conrelid = 'public.user_roles'::regclass
  ) THEN
    ALTER TABLE public.user_roles
      ADD CONSTRAINT user_roles_user_id_key UNIQUE (user_id);
  END IF;
END $$;
