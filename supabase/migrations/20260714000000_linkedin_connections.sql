-- LinkedIn OAuth verification (one connection per SIJIL learner)
create table public.linkedin_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  linkedin_member_id text not null,
  display_name text,
  email text,
  profile_url text,
  avatar_url text,
  verified_at timestamptz,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index linkedin_connections_member_id_unique
  on public.linkedin_connections (linkedin_member_id);

alter table public.linkedin_connections enable row level security;

create policy "linkedin_conn_select_own"
  on public.linkedin_connections for select to authenticated
  using (auth.uid() = user_id);

create policy "linkedin_conn_delete_own"
  on public.linkedin_connections for delete to authenticated
  using (auth.uid() = user_id);

-- Public-safe view (no tokens stored in this table)
create view public.linkedin_connections_public
with (security_invoker = true)
as
select
  user_id,
  linkedin_member_id,
  display_name,
  email,
  profile_url,
  avatar_url,
  verified_at,
  connected_at,
  updated_at
from public.linkedin_connections;
