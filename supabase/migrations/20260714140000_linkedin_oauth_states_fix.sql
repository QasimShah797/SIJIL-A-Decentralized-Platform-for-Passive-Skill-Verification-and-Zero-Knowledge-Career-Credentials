-- LinkedIn OAuth CSRF state storage (service_role only; edge functions read/write).
-- Safe to run on remote DB where the table was never created or had an older shape.
drop table if exists public.linkedin_oauth_states cascade;

create table public.linkedin_oauth_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  state text unique not null,
  code_verifier text not null,
  return_to text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  used boolean not null default false
);

create index linkedin_oauth_states_user_id_idx on public.linkedin_oauth_states (user_id);
create index linkedin_oauth_states_expires_at_idx on public.linkedin_oauth_states (expires_at);

alter table public.linkedin_oauth_states enable row level security;

-- No policies for anon/authenticated. service_role bypasses RLS and is the only writer/reader.
revoke all on table public.linkedin_oauth_states from anon, authenticated;
grant all on table public.linkedin_oauth_states to service_role;
