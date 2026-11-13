-- Phase 2 (hosted-bridge prep): additive Moodle schema gaps for project nhzvtqpplfruzocframc.
-- Source of truth: existing repo migrations + live moodle-sync onConflict keys.
--
-- SAFE / ADDITIVE ONLY — run as one script in hosted SQL Editor after approval.
--   * CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS
--   * SELECT-only RLS for authenticated on new Moodle tables
--   * service_role performs sync writes (bypasses RLS)
--   * NO DROP / TRUNCATE / DELETE / UPDATE of business rows
--   * NO Auth user changes
--
-- INTENTIONALLY OMITTED:
--   * public.moodle_connections — sync uses lms_connections only
--   * UNIQUE (moodle_user_id) on lms_connections — hosted has duplicate moodle_user_id=5
--   * Site-aware unique constraints — sync onConflict does NOT include moodle_site_url
--     (see compatibility notes below); changing uniqueness without code changes would break upserts
--   * evidence_records.evidence_type / skill_evidence_links.match_* — not required by Moodle
--     evidence upsert path for the demo journey
--   * lms_connections.moodle_username — sync strips this column before upsert today
--
-- onConflict compatibility (must match UNIQUE below exactly):
--   imported_lms_evidence → "user_id,moodle_assignment_id"
--   moodle_grades         → "user_id,moodle_course_id,item_id"
--   lms_connections       → "user_id"
-- Cleanup filters by user_id + moodle_site_url; upserts remain site-agnostic per current code.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) lms_connections columns used by moodle-sync connection upsert
-- ---------------------------------------------------------------------------
ALTER TABLE public.lms_connections
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS last_verified timestamptz;

COMMENT ON COLUMN public.lms_connections.provider IS 'LMS provider: moodle, odoo, etc.';
COMMENT ON COLUMN public.lms_connections.last_verified IS
  'When Moodle user identity was last verified via core_user_get_users email lookup.';

CREATE INDEX IF NOT EXISTS lms_connections_provider_idx
  ON public.lms_connections (user_id, provider)
  WHERE provider IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2) moodle_grades — soft-upsert + cleanup target
--    UNIQUE must stay (user_id, moodle_course_id, item_id) for onConflict
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.moodle_grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  moodle_course_id bigint NOT NULL,
  moodle_site_url text,
  item_id bigint NOT NULL,
  item_name text NOT NULL,
  item_type text,
  grade numeric,
  grade_max numeric,
  grade_formatted text,
  raw jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, moodle_course_id, item_id)
);

CREATE INDEX IF NOT EXISTS moodle_grades_user_idx
  ON public.moodle_grades (user_id, moodle_course_id);

CREATE INDEX IF NOT EXISTS moodle_grades_user_site_idx
  ON public.moodle_grades (user_id, moodle_site_url);

ALTER TABLE public.moodle_grades ENABLE ROW LEVEL SECURITY;

-- Authenticated: SELECT own rows only. Writes are service_role-only.
DO $$ BEGIN
  CREATE POLICY "moodle_grades_select_own" ON public.moodle_grades
    FOR SELECT TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 3) imported_lms_evidence — soft-upsert + Integrations mirror
--    UNIQUE must stay (user_id, moodle_assignment_id) for onConflict
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.imported_lms_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'Moodle LMS',
  moodle_site_url text,
  moodle_course_id bigint,
  moodle_assignment_id bigint,
  course_name text NOT NULL,
  activity_name text NOT NULL,
  activity_type text,
  grade text,
  grade_max text,
  submission_status text,
  feedback_preview text,
  lms_evidence_id uuid REFERENCES public.lms_evidence(id) ON DELETE SET NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, moodle_assignment_id)
);

CREATE INDEX IF NOT EXISTS imported_lms_evidence_user_idx
  ON public.imported_lms_evidence (user_id, imported_at DESC);

CREATE INDEX IF NOT EXISTS imported_lms_evidence_user_site_idx
  ON public.imported_lms_evidence (user_id, moodle_site_url);

ALTER TABLE public.imported_lms_evidence ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "imported_lms_ev_select_own" ON public.imported_lms_evidence
    FOR SELECT TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Optional updated_at triggers only if helper already exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'tg_set_updated_at'
  ) THEN
    BEGIN
      CREATE TRIGGER moodle_grades_set_updated_at
      BEFORE UPDATE ON public.moodle_grades
      FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      CREATE TRIGGER imported_lms_evidence_set_updated_at
      BEFORE UPDATE ON public.imported_lms_evidence
      FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

-- Trusted sync path (local bridge / Edge) uses service_role and bypasses RLS.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.moodle_grades TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.imported_lms_evidence TO service_role;
-- Learners: read own rows only (enforced by RLS SELECT policies above).
GRANT SELECT ON TABLE public.moodle_grades TO authenticated;
GRANT SELECT ON TABLE public.imported_lms_evidence TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
