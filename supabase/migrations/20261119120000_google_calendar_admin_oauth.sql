-- Phase 1: SIJIL administrator Google Calendar OAuth (service_role / backend only).
-- DO NOT apply to hosted Supabase without explicit approval.
-- Stores OAuth CSRF state and a single encrypted admin Calendar connection.
-- Recruiters never read these tables; tokens never leave the backend.
-- Status is read via the backend API from google_calendar_connections (no SQL view).

create table if not exists public.google_calendar_oauth_states (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users (id) on delete cascade,
  state text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  used boolean not null default false
);

create index if not exists google_calendar_oauth_states_admin_user_id_idx
  on public.google_calendar_oauth_states (admin_user_id);

create index if not exists google_calendar_oauth_states_expires_at_idx
  on public.google_calendar_oauth_states (expires_at);

alter table public.google_calendar_oauth_states enable row level security;

revoke all on table public.google_calendar_oauth_states from public, anon, authenticated;
grant all on table public.google_calendar_oauth_states to service_role;

-- Singleton-style connection: at most one active SIJIL Calendar owner account.
create table if not exists public.google_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  connected_by_admin_user_id uuid not null references auth.users (id) on delete cascade,
  google_account_email text not null,
  google_account_id text,
  -- AES-256-GCM payloads produced by the backend (never plaintext refresh/access tokens).
  refresh_token_encrypted text not null,
  access_token_encrypted text,
  access_token_expires_at timestamptz,
  scopes text not null default 'https://www.googleapis.com/auth/calendar.events',
  token_status text not null default 'active'
    check (token_status in ('active', 'needs_reauth', 'revoked')),
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_refreshed_at timestamptz,
  -- Phase 1: exactly one platform Calendar owner connection.
  singleton_key text not null default 'platform'
    check (singleton_key = 'platform')
);

create unique index if not exists google_calendar_connections_singleton_idx
  on public.google_calendar_connections (singleton_key);

create index if not exists google_calendar_connections_admin_idx
  on public.google_calendar_connections (connected_by_admin_user_id);

alter table public.google_calendar_connections enable row level security;

revoke all on table public.google_calendar_connections from public, anon, authenticated;
grant all on table public.google_calendar_connections to service_role;

comment on table public.google_calendar_oauth_states is
  'CSRF state for admin Google Calendar OAuth; service_role only.';
comment on table public.google_calendar_connections is
  'Encrypted Google Calendar tokens for the SIJIL admin calendar owner; service_role only.';
