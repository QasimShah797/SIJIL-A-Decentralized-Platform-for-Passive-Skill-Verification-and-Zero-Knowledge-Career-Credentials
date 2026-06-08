ALTER TABLE practical_attempts
ADD CONSTRAINT practical_attempts_user_id_skill_id_key
UNIQUE (user_id, skill_id);
