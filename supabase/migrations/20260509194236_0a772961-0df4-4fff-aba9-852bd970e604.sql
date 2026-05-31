create table if not exists public.github_repo_contributors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  repo_id bigint not null,
  full_name text not null,
  github_url text not null,
  contributor_login text not null,
  contributor_avatar_url text,
  contributor_html_url text,
  contributions integer default 0,
  synced_at timestamptz not null default now(),
  unique (user_id, repo_id, contributor_login)
);

alter table public.github_repo_contributors enable row level security;

create policy "ghc_select_own" on public.github_repo_contributors for select to authenticated using (auth.uid() = user_id);
create policy "ghc_insert_own" on public.github_repo_contributors for insert to authenticated with check (auth.uid() = user_id);
create policy "ghc_update_own" on public.github_repo_contributors for update to authenticated using (auth.uid() = user_id);
create policy "ghc_delete_own" on public.github_repo_contributors for delete to authenticated using (auth.uid() = user_id);

create index if not exists ghc_user_repo_idx on public.github_repo_contributors (user_id, repo_id);