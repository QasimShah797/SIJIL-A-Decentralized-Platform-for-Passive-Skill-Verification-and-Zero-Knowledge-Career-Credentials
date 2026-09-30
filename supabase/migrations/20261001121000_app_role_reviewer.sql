-- Reviewer is the active role for attestation, revoke, and institution-student APIs.
-- `institution` remains as a legacy alias. Idempotent. Does not edit prior migrations.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'reviewer';
