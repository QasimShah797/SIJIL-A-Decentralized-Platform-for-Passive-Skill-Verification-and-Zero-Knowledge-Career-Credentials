-- Purge stale Moodle data for one learner (never touches GitHub, wallet, peer reviews, etc.)

CREATE OR REPLACE FUNCTION public.purge_stale_moodle_data_for_user(
  p_user_id uuid,
  p_current_site text,
  p_force_all boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current text := lower(regexp_replace(trim(p_current_site), '/+$', ''));
  v_feedback int := 0;
  v_imported int := 0;
  v_assignments int := 0;
  v_grades int := 0;
  v_courses int := 0;
  v_lms_evidence int := 0;
  v_evidence_records int := 0;
  v_links int := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  -- skill_evidence_links for Moodle/LMS evidence_records being removed
  WITH stale_records AS (
    SELECT id
    FROM public.evidence_records
    WHERE user_id = p_user_id
      AND (source ILIKE '%moodle%' OR source ILIKE '%lms%')
      AND (
        p_force_all
        OR metadata->>'moodle_site_url' IS NULL
        OR lower(regexp_replace(trim(metadata->>'moodle_site_url'), '/+$', '')) <> v_current
      )
  )
  DELETE FROM public.skill_evidence_links sel
  USING stale_records sr
  WHERE sel.user_id = p_user_id
    AND sel.evidence_record_id = sr.id;
  GET DIAGNOSTICS v_links = ROW_COUNT;

  DELETE FROM public.evidence_records
  WHERE user_id = p_user_id
    AND (source ILIKE '%moodle%' OR source ILIKE '%lms%')
    AND (
      p_force_all
      OR metadata->>'moodle_site_url' IS NULL
      OR lower(regexp_replace(trim(metadata->>'moodle_site_url'), '/+$', '')) <> v_current
    );
  GET DIAGNOSTICS v_evidence_records = ROW_COUNT;

  DELETE FROM public.moodle_feedback
  WHERE user_id = p_user_id
    AND (
      p_force_all
      OR moodle_site_url IS NULL
      OR lower(regexp_replace(trim(moodle_site_url), '/+$', '')) <> v_current
    );
  GET DIAGNOSTICS v_feedback = ROW_COUNT;

  UPDATE public.imported_lms_evidence
  SET lms_evidence_id = NULL
  WHERE user_id = p_user_id
    AND lms_evidence_id IN (
      SELECT id FROM public.lms_evidence
      WHERE user_id = p_user_id
        AND (source ILIKE '%moodle%' OR source ILIKE '%lms%')
        AND (
          p_force_all
          OR moodle_site_url IS NULL
          OR lower(regexp_replace(trim(moodle_site_url), '/+$', '')) <> v_current
        )
    );

  DELETE FROM public.imported_lms_evidence
  WHERE user_id = p_user_id
    AND (
      p_force_all
      OR moodle_site_url IS NULL
      OR lower(regexp_replace(trim(moodle_site_url), '/+$', '')) <> v_current
    );
  GET DIAGNOSTICS v_imported = ROW_COUNT;

  DELETE FROM public.moodle_assignments
  WHERE user_id = p_user_id
    AND (
      p_force_all
      OR moodle_site_url IS NULL
      OR lower(regexp_replace(trim(moodle_site_url), '/+$', '')) <> v_current
    );
  GET DIAGNOSTICS v_assignments = ROW_COUNT;

  DELETE FROM public.moodle_grades
  WHERE user_id = p_user_id
    AND (
      p_force_all
      OR moodle_site_url IS NULL
      OR lower(regexp_replace(trim(moodle_site_url), '/+$', '')) <> v_current
    );
  GET DIAGNOSTICS v_grades = ROW_COUNT;

  DELETE FROM public.moodle_courses
  WHERE user_id = p_user_id
    AND (
      p_force_all
      OR moodle_site_url IS NULL
      OR lower(regexp_replace(trim(moodle_site_url), '/+$', '')) <> v_current
    );
  GET DIAGNOSTICS v_courses = ROW_COUNT;

  DELETE FROM public.lms_evidence
  WHERE user_id = p_user_id
    AND (source ILIKE '%moodle%' OR source ILIKE '%lms%')
    AND (
      p_force_all
      OR moodle_site_url IS NULL
      OR lower(regexp_replace(trim(moodle_site_url), '/+$', '')) <> v_current
    );
  GET DIAGNOSTICS v_lms_evidence = ROW_COUNT;

  RETURN jsonb_build_object(
    'moodle_feedback', v_feedback,
    'moodle_assignments', v_assignments,
    'moodle_courses', v_courses,
    'moodle_grades', v_grades,
    'lms_evidence', v_lms_evidence,
    'imported_lms_evidence', v_imported,
    'evidence_records', v_evidence_records,
    'skill_evidence_links', v_links
  );
END;
$$;

REVOKE ALL ON FUNCTION public.purge_stale_moodle_data_for_user(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_stale_moodle_data_for_user(uuid, text, boolean) TO service_role;

NOTIFY pgrst, 'reload schema';
