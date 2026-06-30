-- Moodle LMS integration tables (learner-scoped, upsert-friendly)

create table public.moodle_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  moodle_user_id bigint not null,
  moodle_email text,
  institution_email text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.moodle_courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  moodle_course_id bigint not null,
  fullname text not null,
  shortname text,
  summary text,
  raw jsonb,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, moodle_course_id)
);

create index moodle_courses_user_idx on public.moodle_courses (user_id, synced_at desc);

create table public.moodle_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  moodle_course_id bigint not null,
  moodle_assignment_id bigint not null,
  moodle_cmid bigint,
  name text not null,
  module_type text not null default 'assign',
  submission_status text,
  grade numeric,
  grade_max numeric,
  grade_formatted text,
  graded_at timestamptz,
  submitted_at timestamptz,
  grade_released boolean not null default false,
  competency_tags jsonb,
  raw jsonb,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, moodle_assignment_id)
);

create index moodle_assignments_user_course_idx
  on public.moodle_assignments (user_id, moodle_course_id, synced_at desc);

create table public.moodle_grades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  moodle_course_id bigint not null,
  item_id bigint not null,
  item_name text not null,
  item_type text,
  grade numeric,
  grade_max numeric,
  grade_formatted text,
  raw jsonb,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, moodle_course_id, item_id)
);

create index moodle_grades_user_idx on public.moodle_grades (user_id, moodle_course_id);

create table public.moodle_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  moodle_assignment_id bigint not null,
  feedback_text text,
  grader_id bigint,
  raw jsonb,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, moodle_assignment_id)
);

create table public.imported_lms_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  source text not null default 'Moodle LMS',
  moodle_course_id bigint,
  moodle_assignment_id bigint,
  course_name text not null,
  activity_name text not null,
  activity_type text,
  grade text,
  grade_max text,
  submission_status text,
  feedback_preview text,
  lms_evidence_id uuid references public.lms_evidence (id) on delete set null,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, moodle_assignment_id)
);

create index imported_lms_evidence_user_idx
  on public.imported_lms_evidence (user_id, imported_at desc);

-- RLS
alter table public.moodle_connections enable row level security;
alter table public.moodle_courses enable row level security;
alter table public.moodle_assignments enable row level security;
alter table public.moodle_grades enable row level security;
alter table public.moodle_feedback enable row level security;
alter table public.imported_lms_evidence enable row level security;

create policy "moodle_conn_select_own" on public.moodle_connections
  for select to authenticated using (auth.uid() = user_id);
create policy "moodle_conn_insert_own" on public.moodle_connections
  for insert to authenticated with check (auth.uid() = user_id);
create policy "moodle_conn_update_own" on public.moodle_connections
  for update to authenticated using (auth.uid() = user_id);
create policy "moodle_conn_delete_own" on public.moodle_connections
  for delete to authenticated using (auth.uid() = user_id);

create policy "moodle_courses_select_own" on public.moodle_courses
  for select to authenticated using (auth.uid() = user_id);
create policy "moodle_courses_insert_own" on public.moodle_courses
  for insert to authenticated with check (auth.uid() = user_id);
create policy "moodle_courses_update_own" on public.moodle_courses
  for update to authenticated using (auth.uid() = user_id);
create policy "moodle_courses_delete_own" on public.moodle_courses
  for delete to authenticated using (auth.uid() = user_id);

create policy "moodle_assign_select_own" on public.moodle_assignments
  for select to authenticated using (auth.uid() = user_id);
create policy "moodle_assign_insert_own" on public.moodle_assignments
  for insert to authenticated with check (auth.uid() = user_id);
create policy "moodle_assign_update_own" on public.moodle_assignments
  for update to authenticated using (auth.uid() = user_id);
create policy "moodle_assign_delete_own" on public.moodle_assignments
  for delete to authenticated using (auth.uid() = user_id);

create policy "moodle_grades_select_own" on public.moodle_grades
  for select to authenticated using (auth.uid() = user_id);
create policy "moodle_grades_insert_own" on public.moodle_grades
  for insert to authenticated with check (auth.uid() = user_id);
create policy "moodle_grades_update_own" on public.moodle_grades
  for update to authenticated using (auth.uid() = user_id);
create policy "moodle_grades_delete_own" on public.moodle_grades
  for delete to authenticated using (auth.uid() = user_id);

create policy "moodle_feedback_select_own" on public.moodle_feedback
  for select to authenticated using (auth.uid() = user_id);
create policy "moodle_feedback_insert_own" on public.moodle_feedback
  for insert to authenticated with check (auth.uid() = user_id);
create policy "moodle_feedback_update_own" on public.moodle_feedback
  for update to authenticated using (auth.uid() = user_id);
create policy "moodle_feedback_delete_own" on public.moodle_feedback
  for delete to authenticated using (auth.uid() = user_id);

create policy "imported_lms_ev_select_own" on public.imported_lms_evidence
  for select to authenticated using (auth.uid() = user_id);
create policy "imported_lms_ev_insert_own" on public.imported_lms_evidence
  for insert to authenticated with check (auth.uid() = user_id);
create policy "imported_lms_ev_update_own" on public.imported_lms_evidence
  for update to authenticated using (auth.uid() = user_id);
create policy "imported_lms_ev_delete_own" on public.imported_lms_evidence
  for delete to authenticated using (auth.uid() = user_id);

-- Service role upserts from edge function bypass RLS when using service role key

create trigger moodle_connections_set_updated_at
before update on public.moodle_connections
for each row execute function public.tg_set_updated_at();

create trigger moodle_courses_set_updated_at
before update on public.moodle_courses
for each row execute function public.tg_set_updated_at();

create trigger moodle_assignments_set_updated_at
before update on public.moodle_assignments
for each row execute function public.tg_set_updated_at();

create trigger moodle_grades_set_updated_at
before update on public.moodle_grades
for each row execute function public.tg_set_updated_at();

create trigger moodle_feedback_set_updated_at
before update on public.moodle_feedback
for each row execute function public.tg_set_updated_at();

create trigger imported_lms_evidence_set_updated_at
before update on public.imported_lms_evidence
for each row execute function public.tg_set_updated_at();
