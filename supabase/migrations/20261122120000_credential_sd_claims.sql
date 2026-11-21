-- Issuer-bound selective disclosure claim salts (never returned on public share APIs).
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

-- Service role / backend only; no learner direct select of salts.
drop policy if exists credential_sd_claims_no_client on public.credential_sd_claims;
create policy credential_sd_claims_no_client
  on public.credential_sd_claims
  for all
  using (false)
  with check (false);
