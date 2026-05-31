
-- Enums
CREATE TYPE public.app_role AS ENUM ('learner', 'recruiter', 'institution', 'admin');
CREATE TYPE public.recruiter_status AS ENUM ('pending', 'verified', 'rejected');
CREATE TYPE public.institution_request_status AS ENUM ('pending', 'approved', 'rejected', 'credentials_sent');
CREATE TYPE public.institution_status AS ENUM ('pending_setup', 'verified', 'suspended');

-- user_roles
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "users insert own non-admin role" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND role IN ('learner','recruiter'));
CREATE POLICY "admins manage all roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- learner_profiles
CREATE TABLE public.learner_profiles (
  user_id uuid PRIMARY KEY,
  first_name text NOT NULL,
  last_name text NOT NULL,
  contact_number text,
  institution_name text,
  program text,
  student_id text,
  github_url text,
  linkedin_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.learner_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "learner own select" ON public.learner_profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "learner own insert" ON public.learner_profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "learner own update" ON public.learner_profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "admin read learners" ON public.learner_profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER learner_profiles_updated BEFORE UPDATE ON public.learner_profiles FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- recruiter_profiles
CREATE TABLE public.recruiter_profiles (
  user_id uuid PRIMARY KEY,
  full_name text NOT NULL,
  work_email text NOT NULL,
  company_name text NOT NULL,
  job_title text NOT NULL,
  company_website text,
  linkedin_url text,
  contact_number text,
  reason text,
  verification_status public.recruiter_status NOT NULL DEFAULT 'pending',
  verified_at timestamptz,
  verified_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.recruiter_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recruiter own select" ON public.recruiter_profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "recruiter own insert" ON public.recruiter_profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "recruiter own update" ON public.recruiter_profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "admin read recruiters" ON public.recruiter_profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin update recruiters" ON public.recruiter_profiles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER recruiter_profiles_updated BEFORE UPDATE ON public.recruiter_profiles FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Prevent learners/recruiters from changing verification_status themselves
CREATE OR REPLACE FUNCTION public.guard_recruiter_verification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    NEW.verification_status := OLD.verification_status;
    NEW.verified_at := OLD.verified_at;
    NEW.verified_by := OLD.verified_by;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER recruiter_verify_guard BEFORE UPDATE ON public.recruiter_profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_recruiter_verification();

-- institution_access_requests (public submission)
CREATE TABLE public.institution_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_name text NOT NULL,
  official_email text NOT NULL,
  contact_person_name text NOT NULL,
  contact_person_role text NOT NULL,
  department text NOT NULL,
  website text NOT NULL,
  contact_number text,
  reason text,
  notes text,
  status public.institution_request_status NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.institution_access_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can submit institution request" ON public.institution_access_requests FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "admin read requests" ON public.institution_access_requests FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin update requests" ON public.institution_access_requests FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER inst_req_updated BEFORE UPDATE ON public.institution_access_requests FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- institution_profiles (admin-created)
CREATE TABLE public.institution_profiles (
  user_id uuid PRIMARY KEY,
  institution_name text NOT NULL,
  website text,
  contact_email text,
  status public.institution_status NOT NULL DEFAULT 'pending_setup',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.institution_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "institution own select" ON public.institution_profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "admin manage institutions" ON public.institution_profiles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER inst_prof_updated BEFORE UPDATE ON public.institution_profiles FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
