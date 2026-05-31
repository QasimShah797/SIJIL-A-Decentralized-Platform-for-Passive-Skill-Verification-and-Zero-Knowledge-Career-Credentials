-- Table to store GitHub repositories with skill mapping
create table if not exists public.github_repos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  github_username text not null,
  repo_id bigint not null,
  repo_name text not null,            -- short name e.g. "grocery-subscription"
  full_name text not null,            -- "owner/repo"
  github_url text not null,
  description text,
  primary_language text,              -- can be null if not detected
  last_updated timestamptz,
  commit_count integer,
  linked_skill_id text,               -- references mock skill id like "sk-001"
  linked_skill_name text,             -- denormalized for display
  linked_at timestamptz,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, repo_id)
);

alter table public.github_repos enable row level security;

create policy "gh_repos_select_own" on public.github_repos
  for select to authenticated using (auth.uid() = user_id);
create policy "gh_repos_insert_own" on public.github_repos
  for insert to authenticated with check (auth.uid() = user_id);
create policy "gh_repos_update_own" on public.github_repos
  for update to authenticated using (auth.uid() = user_id);
create policy "gh_repos_delete_own" on public.github_repos
  for delete to authenticated using (auth.uid() = user_id);

create trigger trg_github_repos_updated_at
  before update on public.github_repos
  for each row execute function public.tg_set_updated_at();

create index if not exists idx_github_repos_user on public.github_repos(user_id);
create index if not exists idx_github_repos_linked_skill on public.github_repos(user_id, linked_skill_id);