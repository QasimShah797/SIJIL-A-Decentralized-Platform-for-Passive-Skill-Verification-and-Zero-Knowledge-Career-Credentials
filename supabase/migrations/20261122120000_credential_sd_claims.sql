-- Issuer-bound selective disclosure claim salts (never returned on public share APIs).
-- Do NOT run via `supabase db push` on the live project if schema_migrations is incomplete;
-- apply this file alone after review (SQL editor or linked db query).
--
-- LIVE DEPLOYMENT NOTE (project nhzvtqpplfruzocframc):
-- Older SIJIL tables already exist. Apply ONLY this file, then optionally record
-- version 20261122120000 in schema_migrations / migration repair.

create table if not exists public.credential_sd_claims (
  id uuid primary key default gen_random_uuid(),
  credential_id uuid not null references public.credentials(id) on delete cascade,
  claim_id text not null,
  salt text not null,
  value_fingerprint text not null,
  created_at timestamptz not null default now(),
  unique (credential_id, claim_id)
);

create index if not exists credential_sd_claims_credential_idx
  on public.credential_sd_claims (credential_id);

alter table public.credential_sd_claims enable row level security;

-- Deny browser/client roles. Service role bypasses RLS but still needs grants.
drop policy if exists credential_sd_claims_no_client on public.credential_sd_claims;
create policy credential_sd_claims_no_client
  on public.credential_sd_claims
  for all
  to anon, authenticated
  using (false)
  with check (false);

revoke all on table public.credential_sd_claims from public, anon, authenticated;
grant select, insert, update, delete on table public.credential_sd_claims to service_role;

comment on table public.credential_sd_claims is
  'Private SD-claim-digest-v1 salts. Backend/service_role only. Never expose on public APIs.';
