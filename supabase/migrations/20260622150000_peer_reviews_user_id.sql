-- Ensure peer_reviews.user_id exists and aligns with learner_user_id for secure submits

ALTER TABLE public.peer_reviews
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

UPDATE public.peer_reviews
SET user_id = learner_user_id
WHERE user_id IS NULL AND learner_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS peer_reviews_user_idx
  ON public.peer_reviews (user_id);
