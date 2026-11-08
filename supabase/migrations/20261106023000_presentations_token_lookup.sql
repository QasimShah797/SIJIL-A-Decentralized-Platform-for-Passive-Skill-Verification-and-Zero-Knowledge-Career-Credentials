-- Legacy presentations: recruiters must not list every share row or its raw token.
-- Exact-token lookup stays available through presentation_by_token.
-- Owners keep presentations_select_own. Do not apply this file to hosted Supabase from an agent session.
-- If public.presentations was never created, this file does nothing.

DO $migrate$
BEGIN
  IF to_regclass('public.presentations') IS NULL THEN
    RAISE NOTICE 'public.presentations is absent; legacy token lookup was not installed';
    RETURN;
  END IF;

  EXECUTE $sql$
DROP POLICY IF EXISTS "presentations_select_recruiter" ON public.presentations;

CREATE OR REPLACE FUNCTION public.presentation_by_token(p_token text)
RETURNS TABLE (
  token text,
  user_id uuid,
  credential_id uuid,
  candidate_user_id uuid,
  recipient text,
  recipient_did text,
  created_at timestamptz,
  expires_at timestamptz,
  revoked boolean,
  disclosed_fields jsonb,
  hidden_fields text[],
  proof jsonb,
  credential_uri text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.token,
    p.user_id,
    p.credential_id,
    p.candidate_user_id,
    p.recipient,
    p.recipient_did,
    p.created_at,
    p.expires_at,
    p.revoked,
    p.disclosed_fields,
    p.hidden_fields,
    p.proof,
    c.credential_uri
  FROM public.presentations p
  LEFT JOIN public.credentials c ON c.id = p.credential_id
  WHERE p.token = p_token
    AND length(btrim(p_token)) > 0
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.presentation_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.presentation_by_token(text) TO authenticated;

COMMENT ON FUNCTION public.presentation_by_token(text) IS
  'Returns one legacy presentation when the caller presents its exact token. Does not list other rows.';
$sql$;
END
$migrate$;
