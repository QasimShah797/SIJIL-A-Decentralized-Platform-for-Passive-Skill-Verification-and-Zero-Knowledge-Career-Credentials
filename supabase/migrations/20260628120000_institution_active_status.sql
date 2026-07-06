-- E1-US1 Phase 1: institution accounts provisioned manually use status = active.
ALTER TYPE public.institution_status ADD VALUE IF NOT EXISTS 'active';
