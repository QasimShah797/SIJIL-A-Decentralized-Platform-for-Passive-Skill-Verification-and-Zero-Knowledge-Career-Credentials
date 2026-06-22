-- GitHub imported review metadata columns

ALTER TABLE public.peer_reviews
  ADD COLUMN IF NOT EXISTS review_source text,
  ADD COLUMN IF NOT EXISTS context_verified boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS peer_reviews_review_source_idx
  ON public.peer_reviews (review_source)
  WHERE review_source IS NOT NULL;

NOTIFY pgrst, 'reload schema';
