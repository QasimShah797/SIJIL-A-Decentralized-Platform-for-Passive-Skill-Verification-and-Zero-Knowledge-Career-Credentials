-- Ensure practical_attempts can be keyed by learner + skill (fixes upsert / start-task errors)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'practical_attempts_user_id_skill_id_key'
  ) THEN
    ALTER TABLE public.practical_attempts
      ADD CONSTRAINT practical_attempts_user_id_skill_id_key UNIQUE (user_id, skill_id);
  END IF;
END $$;
