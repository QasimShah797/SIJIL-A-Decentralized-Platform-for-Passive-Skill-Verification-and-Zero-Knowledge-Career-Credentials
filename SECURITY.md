# SIJIL security notes

## Backend-write-only tables

Verification, pipeline, and proof fields must not be writable by a learner JWT through the Supabase client. After `20260930120000_lock_trust_bearing_writes.sql`:

| Table | Client writes | Why |
| --- | --- | --- |
| `public.credentials` | **None** (SELECT only) | Holds `verification_status`, `attestation_status`, `proof`, and hashes. A learner must not self-issue or rewrite a credential. |
| `public.wallet_competency_records` | **None** (SELECT only) | Persisted wallet status and evidence summary used as the share source of truth. |
| `public.selective_disclosure_presentations` | **None** (SELECT only) | Share tokens, payload hashes, proofs, and `revoked_at`. Tampering would fake or un-revoke a presentation. |

All inserts/updates/deletes on those three tables go through the Express API with `authMiddleware`, Zod validation, ownership checks (`user_id` / `learner_id` === `req.user.id`), and the Supabase **service role**.

`public.declared_skills` and `public.supporting_records` still allow learners to declare a skill (name/domain/description) and attach their own evidence (title/url/source). A `BEFORE INSERT OR UPDATE` trigger rejects non-service-role changes to trust-bearing columns (`pipeline_stage`, `status`, `last_credential_sync_at`, and any `verification_status` / `attestation_status` / `lms_verified` / `verified` columns if present).

Offline Supabase fallback remains for **reads** and for those legitimate learner columns. Locked writes have no client fallback.
