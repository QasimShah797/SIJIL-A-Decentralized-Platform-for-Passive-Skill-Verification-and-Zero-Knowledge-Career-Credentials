-- Recruiter interview invites need the learner's signup email (auth.users),
-- not only learner_profiles.university_email, which is often empty.

CREATE OR REPLACE FUNCTION public.learner_contact_email(_user_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed boolean := false;
  contact text;
BEGIN
  IF auth.uid() = _user_id OR public.has_role(auth.uid(), 'admin') THEN
    allowed := true;
  ELSIF public.has_role(auth.uid(), 'recruiter') THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.selective_disclosure_presentations s
      WHERE s.learner_id = _user_id
        AND s.revoked_at IS NULL
        AND (s.expires_at IS NULL OR s.expires_at > now())
    ) INTO allowed;

    IF NOT allowed THEN
      BEGIN
        SELECT EXISTS (
          SELECT 1
          FROM public.presentations p
          WHERE p.candidate_user_id = _user_id
            AND coalesce(p.revoked, false) = false
            AND (p.expires_at IS NULL OR p.expires_at > now())
        ) INTO allowed;
      EXCEPTION
        WHEN undefined_table THEN
          allowed := false;
      END;
    END IF;
  END IF;

  IF NOT allowed THEN
    RETURN NULL;
  END IF;

  SELECT NULLIF(btrim(lp.university_email), '')
  INTO contact
  FROM public.learner_profiles lp
  WHERE lp.user_id = _user_id;

  IF contact IS NULL OR position('@' in contact) = 0 THEN
    SELECT au.email
    INTO contact
    FROM auth.users au
    WHERE au.id = _user_id;
  END IF;

  RETURN contact;
END;
$$;

REVOKE ALL ON FUNCTION public.learner_contact_email(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.learner_contact_email(uuid) TO authenticated;
