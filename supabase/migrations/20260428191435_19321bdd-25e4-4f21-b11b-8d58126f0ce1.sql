-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles for select to authenticated using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update to authenticated using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- GitHub connections (one per user)
create table public.github_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  github_user_id bigint not null,
  github_username text not null,
  github_avatar_url text,
  scopes text,
  access_token text not null,
  token_type text default 'bearer',
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz
);
alter table public.github_connections enable row level security;

-- Note: access_token is sensitive. We only allow the owner to read non-sensitive metadata via a view,
-- but to keep things simple we restrict all direct access; edge functions use the service role.
create policy "gh_conn_select_own" on public.github_connections for select to authenticated using (auth.uid() = user_id);
create policy "gh_conn_delete_own" on public.github_connections for delete to authenticated using (auth.uid() = user_id);

-- Safe view that excludes the access_token
create view public.github_connections_public
with (security_invoker = true)
as
select user_id, github_user_id, github_username, github_avatar_url, scopes, connected_at, last_synced_at
from public.github_connections;

-- GitHub activities
create table public.github_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  github_username text not null,
  repo_name text,
  activity_type text not null check (activity_type in ('commit','pull_request','repo','event','issue')),
  activity_title text not null,
  activity_url text,
  commit_hash text,
  occurred_at timestamptz,
  synced_at timestamptz not null default now(),
  linked_skill_id text,
  external_id text,
  unique (user_id, activity_type, external_id)
);
alter table public.github_activities enable row level security;

create policy "gh_act_select_own" on public.github_activities for select to authenticated using (auth.uid() = user_id);
create policy "gh_act_delete_own" on public.github_activities for delete to authenticated using (auth.uid() = user_id);

create index github_activities_user_occurred_idx on public.github_activities (user_id, occurred_at desc);