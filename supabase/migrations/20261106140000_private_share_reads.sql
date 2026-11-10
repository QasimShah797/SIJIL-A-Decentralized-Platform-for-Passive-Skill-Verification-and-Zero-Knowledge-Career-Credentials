-- Private share links are not a recruiter directory.
-- LOCAL FILE ONLY. Do not apply to hosted Supabase from an agent session.
-- Does not change tokens, hashes, DIDs, credential documents, or proof bytes.
-- Owners keep their own SELECT policies. Public verification stays on the API,
-- which looks up a share by its token hash with the service role.

DROP POLICY IF EXISTS "selective_disclosure_presentations_select_recruiter"
  ON public.selective_disclosure_presentations;

DROP POLICY IF EXISTS "credentials_select_recruiter" ON public.credentials;

DROP POLICY IF EXISTS "skills_select_recruiter_institution" ON public.declared_skills;
DROP POLICY IF EXISTS "skills_select_institution" ON public.declared_skills;
CREATE POLICY "skills_select_institution"
  ON public.declared_skills
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'institution'));

CREATE OR REPLACE FUNCTION public.learner_has_recruiter_directory_share(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.selective_disclosure_presentations s
    WHERE s.learner_id = _user_id
      AND s.revoked_at IS NULL
      AND (s.expires_at IS NULL OR s.expires_at > now())
      AND s.disclosed_payload->>'audience' = 'recruiter-directory'
  );
$$;

REVOKE ALL ON FUNCTION public.learner_has_recruiter_directory_share(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.learner_has_recruiter_directory_share(uuid) TO authenticated;

DROP POLICY IF EXISTS "recruiter read learners" ON public.learner_profiles;
DROP POLICY IF EXISTS "recruiter read directory learners" ON public.learner_profiles;
CREATE POLICY "recruiter read directory learners"
  ON public.learner_profiles
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'recruiter')
    AND public.learner_has_recruiter_directory_share(user_id)
  );

REVOKE ALL ON TABLE public.selective_disclosure_presentations FROM anon;
REVOKE ALL ON TABLE public.credentials FROM anon;

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
        AND s.disclosed_payload->>'audience' = 'recruiter-directory'
        AND s.selected_fields @> '["learner_contact"]'::jsonb
    ) INTO allowed;
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

COMMENT ON FUNCTION public.learner_contact_email(uuid) IS
  'Returns a contact email to the learner, an admin, or a recruiter only when an active directory share explicitly includes learner_contact. A private share link does not qualify.';
