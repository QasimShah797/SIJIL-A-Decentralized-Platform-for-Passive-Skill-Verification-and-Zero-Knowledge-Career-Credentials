-- Run once in Supabase Dashboard → SQL Editor (remote project; no Docker required).
-- Required before npm run seed:institution if status 'active' is not in the enum yet.

ALTER TYPE public.institution_status ADD VALUE IF NOT EXISTS 'active';
