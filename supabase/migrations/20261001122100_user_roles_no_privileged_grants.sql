-- Reviewer/admin cannot be self-granted. Learner/recruiter self-insert remains for signup.
-- Service role bypasses RLS and is the only writer of reviewer/admin rows.
-- Must run after 20261001121000 (app_role ADD VALUE reviewer).
-- Idempotent. Does not edit prior migrations.

DROP POLICY IF EXISTS "users insert own non-admin role" ON public.user_roles;
DROP POLICY IF EXISTS "admins manage all roles" ON public.user_roles;
DROP POLICY IF EXISTS "users insert own learner or recruiter role" ON public.user_roles;
DROP POLICY IF EXISTS "users update own roles" ON public.user_roles;

CREATE POLICY "users insert own learner or recruiter role"
  ON public.user_roles FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND role IN ('learner'::public.app_role, 'recruiter'::public.app_role)
  );

-- No UPDATE/DELETE policies for authenticated. SELECT own roles remains.
