-- Canonicalize legacy MoodleCloud URLs (sijil.moodlecloud.com → sijil-fyp.moodlecloud.com)
-- Safe: only touches Moodle/LMS rows, never GitHub/wallet/profile data.

DO $$
DECLARE
  v_old_host text := 'sijil.moodlecloud.com';
  v_new_url text := 'https://sijil-fyp.moodlecloud.com';
  v_new_norm text := 'https://sijil-fyp.moodlecloud.com';
BEGIN
  -- lms_connections: fix stored Moodle site URL
  UPDATE public.lms_connections
  SET moodle_site_url = v_new_norm,
      updated_at = now()
  WHERE moodle_site_url IS NOT NULL
    AND (
      lower(regexp_replace(trim(moodle_site_url), '/+$', '')) LIKE '%' || v_old_host || '%'
      OR (
        lower(regexp_replace(trim(moodle_site_url), '/+$', '')) LIKE '%moodlecloud.com%'
        AND lower(regexp_replace(trim(moodle_site_url), '/+$', '')) NOT LIKE '%sijil-fyp%'
      )
    );

  -- Remove imported Moodle rows tied to the legacy host (per-learner scoped via user_id column)
  DELETE FROM public.moodle_feedback
  WHERE moodle_site_url IS NOT NULL
    AND lower(regexp_replace(trim(moodle_site_url), '/+$', '')) LIKE '%' || v_old_host || '%';

  DELETE FROM public.imported_lms_evidence
  WHERE moodle_site_url IS NOT NULL
    AND lower(regexp_replace(trim(moodle_site_url), '/+$', '')) LIKE '%' || v_old_host || '%';

  DELETE FROM public.moodle_assignments
  WHERE moodle_site_url IS NOT NULL
    AND lower(regexp_replace(trim(moodle_site_url), '/+$', '')) LIKE '%' || v_old_host || '%';

  DELETE FROM public.moodle_grades
  WHERE moodle_site_url IS NOT NULL
    AND lower(regexp_replace(trim(moodle_site_url), '/+$', '')) LIKE '%' || v_old_host || '%';

  DELETE FROM public.moodle_courses
  WHERE moodle_site_url IS NOT NULL
    AND lower(regexp_replace(trim(moodle_site_url), '/+$', '')) LIKE '%' || v_old_host || '%';

  DELETE FROM public.lms_evidence
  WHERE (source ILIKE '%moodle%' OR source ILIKE '%lms%')
    AND moodle_site_url IS NOT NULL
    AND lower(regexp_replace(trim(moodle_site_url), '/+$', '')) LIKE '%' || v_old_host || '%';

  -- Legacy rows without moodle_site_url but old host embedded in raw JSON
  DELETE FROM public.moodle_courses
  WHERE moodle_site_url IS NULL
    AND raw::text ILIKE '%' || v_old_host || '%';

  DELETE FROM public.moodle_assignments
  WHERE moodle_site_url IS NULL
    AND raw::text ILIKE '%' || v_old_host || '%';

  DELETE FROM public.lms_evidence
  WHERE (source ILIKE '%moodle%' OR source ILIKE '%lms%')
    AND moodle_site_url IS NULL
    AND (raw::text ILIKE '%' || v_old_host || '%' OR text_preview ILIKE '%' || v_old_host || '%');
END $$;

NOTIFY pgrst, 'reload schema';
