
-- LMS connections (no secrets stored)
create table public.lms_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  odoo_url text,
  odoo_db text,
  odoo_login text,
  has_api_key boolean not null default false,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.lms_connections enable row level security;

create policy "lms_conn_select_own" on public.lms_connections
  for select to authenticated using (auth.uid() = user_id);
create policy "lms_conn_insert_own" on public.lms_connections
  for insert to authenticated with check (auth.uid() = user_id);
create policy "lms_conn_update_own" on public.lms_connections
  for update to authenticated using (auth.uid() = user_id);
create policy "lms_conn_delete_own" on public.lms_connections
  for delete to authenticated using (auth.uid() = user_id);

-- LMS evidence
create table public.lms_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  source text not null default 'CUST Odoo LMS',
  course_name text not null,
  course_code text,
  grade text,
  completion_status text,
  certificate_url text,
  evidence_hash text not null,
  raw jsonb,
  linked_skill_id text,
  text_preview text,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index lms_evidence_user_idx on public.lms_evidence(user_id, fetched_at desc);
create unique index lms_evidence_user_hash_idx on public.lms_evidence(user_id, evidence_hash);

alter table public.lms_evidence enable row level security;

create policy "lms_ev_select_own" on public.lms_evidence
  for select to authenticated using (auth.uid() = user_id);
create policy "lms_ev_insert_own" on public.lms_evidence
  for insert to authenticated with check (auth.uid() = user_id);
create policy "lms_ev_update_own" on public.lms_evidence
  for update to authenticated using (auth.uid() = user_id);
create policy "lms_ev_delete_own" on public.lms_evidence
  for delete to authenticated using (auth.uid() = user_id);

-- updated_at trigger for lms_connections
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger lms_connections_set_updated_at
before update on public.lms_connections
for each row execute function public.tg_set_updated_at();

-- Private storage bucket for transcripts
insert into storage.buckets (id, name, public)
values ('lms-transcripts', 'lms-transcripts', false)
on conflict (id) do nothing;

create policy "lms_tx_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'lms-transcripts' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "lms_tx_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'lms-transcripts' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "lms_tx_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'lms-transcripts' and auth.uid()::text = (storage.foldername(name))[1]);
