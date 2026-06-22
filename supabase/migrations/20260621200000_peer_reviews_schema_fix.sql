-- Fix incomplete peer_reviews schema (safe to re-run)

ALTER TABLE public.peer_reviews
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'SIJIL',
  ADD COLUMN IF NOT EXISTS project_id text,
  ADD COLUMN IF NOT EXISTS project_name text,
  ADD COLUMN IF NOT EXISTS evidence_label text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS evidence_url text,
  ADD COLUMN IF NOT EXISTS recommendation text,
  ADD COLUMN IF NOT EXISTS review_date timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS context_status text NOT NULL DEFAULT 'Context Pending',
  ADD COLUMN IF NOT EXISTS contributor_verification text,
  ADD COLUMN IF NOT EXISTS trust_weight text NOT NULL DEFAULT 'Medium Trust',
  ADD COLUMN IF NOT EXISTS imported boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS evidence_record_id uuid REFERENCES public.evidence_records(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS skill_id uuid REFERENCES public.declared_skills(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_type text,
  ADD COLUMN IF NOT EXISTS external_reference text,
  ADD COLUMN IF NOT EXISTS review_request_id uuid,
  ADD COLUMN IF NOT EXISTS trust_weight_score numeric(4, 2),
  ADD COLUMN IF NOT EXISTS relationship text,
  ADD COLUMN IF NOT EXISTS reviewer_email text,
  ADD COLUMN IF NOT EXISTS review_source text,
  ADD COLUMN IF NOT EXISTS context_verified boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS peer_reviews_external_ref_unique
  ON public.peer_reviews (learner_user_id, external_reference)
  WHERE external_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS peer_reviews_evidence_idx
  ON public.peer_reviews (evidence_record_id);
CREATE INDEX IF NOT EXISTS peer_reviews_skill_idx
  ON public.peer_reviews (skill_id);

-- Sync legacy user_id column with learner_user_id (older peer_reviews schemas)

ALTER TABLE public.peer_reviews
  ADD COLUMN IF NOT EXISTS learner_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

UPDATE public.peer_reviews
SET learner_user_id = user_id
WHERE learner_user_id IS NULL AND user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.peer_reviews_sync_user_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.user_id IS NULL AND NEW.learner_user_id IS NOT NULL THEN
    NEW.user_id := NEW.learner_user_id;
  END IF;
  IF NEW.learner_user_id IS NULL AND NEW.user_id IS NOT NULL THEN
    NEW.learner_user_id := NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_peer_reviews_sync_user_columns ON public.peer_reviews;
CREATE TRIGGER trg_peer_reviews_sync_user_columns
  BEFORE INSERT OR UPDATE ON public.peer_reviews
  FOR EACH ROW EXECUTE FUNCTION public.peer_reviews_sync_user_columns();

NOTIFY pgrst, 'reload schema';
