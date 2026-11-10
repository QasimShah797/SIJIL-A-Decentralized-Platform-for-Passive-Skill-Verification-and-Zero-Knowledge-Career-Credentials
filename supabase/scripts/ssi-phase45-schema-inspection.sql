-- Read-only inspection for SSI sharing storage.
-- Do not run this against hosted Supabase unless that read is explicitly approved.
-- These statements do not insert, update, delete, or change policies.

-- Table existence
SELECT n.nspname AS schema_name, c.relname AS table_name, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
    'learner_ssi_identities',
    'ssi_bind_challenges',
    'ssi_presentation_challenges',
    'ssi_verifiable_presentations',
    'selective_disclosure_presentations',
    'presentations'
  )
ORDER BY c.relname;

-- Columns and constraints
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'learner_ssi_identities',
    'ssi_bind_challenges',
    'ssi_presentation_challenges',
    'ssi_verifiable_presentations',
    'selective_disclosure_presentations',
    'presentations'
  )
ORDER BY table_name, ordinal_position;

SELECT c.relname AS table_name, con.conname, pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'learner_ssi_identities',
    'ssi_bind_challenges',
    'ssi_presentation_challenges',
    'ssi_verifiable_presentations',
    'selective_disclosure_presentations',
    'presentations'
  )
ORDER BY 1, 2;

-- Policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'learner_ssi_identities',
    'ssi_bind_challenges',
    'ssi_presentation_challenges',
    'ssi_verifiable_presentations',
    'selective_disclosure_presentations',
    'presentations'
  )
ORDER BY tablename, policyname;

-- Functions used by sharing access
SELECT n.nspname AS schema_name, p.proname AS function_name, pg_get_function_identity_arguments(p.oid) AS arguments
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('presentation_by_token', 'has_role', 'learner_contact_email');

-- Migration history, when the Supabase migrations table exists
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE version IN (
  '20260607120000',
  '20260712120000',
  '20260902120000',
  '20260930120000',
  '20261002133000',
  '20261016120000',
  '20261017120000',
  '20261031190000',
  '20261106013000',
  '20261106023000'
)
ORDER BY version;
