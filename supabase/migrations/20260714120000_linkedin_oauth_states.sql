-- Server-side LinkedIn OAuth state (PKCE + return path). Edge functions use service role only.
create table public.linkedin_oauth_states (
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  code_verifier text not null,
  return_to text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index linkedin_oauth_states_user_id_idx on public.linkedin_oauth_states (user_id);
create index linkedin_oauth_states_expires_at_idx on public.linkedin_oauth_states (expires_at);

alter table public.linkedin_oauth_states enable row level security;

-- No policies: clients cannot read or write OAuth state rows.
