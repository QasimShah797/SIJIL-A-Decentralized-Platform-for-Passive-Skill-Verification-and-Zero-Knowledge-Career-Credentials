# SIJIL Database Schema (ERD-aligned)

This folder documents the relational schema derived from the product ERD and the
remote Supabase column / FK CSV exports.

## Sources

| File | Role |
|------|------|
| `columns.csv` | Complete public table/column inventory after ERD alignment |
| `foreign_keys.csv` | Intended foreign-key graph (CSV export had only 14 public FKs) |
| `../migrations/20260712190000_erd_schema_relationships.sql` | Migration that applies missing FKs + ERD tables |

## Design principles

1. **Profiles hub** — `profiles.id` = `auth.users.id`. Specialty rows live in
   `learner_profiles`, `recruiter_profiles`, and `institution_profiles`.
2. **User FKs target `auth.users`** — avoids signup races before the profiles
   trigger inserts the `profiles` row.
3. **External IDs stay as bigint** — Moodle/GitHub remote IDs remain
   (`moodle_course_id`, `repo_id`, etc.). Local UUID FKs are added beside them
   (`course_id`, `github_repo_uuid`, …).
4. **`skill_evidence_links` is the junction hub** — connects declared skills to
   evidence records, MCQ attempts, practical attempts, and review requests.
5. **Credential path** — `learner_profiles` → `decentralized_identities` →
   `credentials` → `credential_shares` → `disclosed_attributes`, with recruiter
   `verification_requests` / `verification_results`.

## Gaps fixed vs original FK CSV

Original export only contained peer-review / evidence ↔ skill links. Added:

- Identity FKs (`user_roles`, learner/recruiter/institution profiles, LMS, tokens)
- Skill / attempt / peer-review ownership FKs
- `linked_skill_id` text → uuid + FK to `declared_skills`
- GitHub connection → repos / sync logs / attempts
- Repo → contributors / activities / evidence
- LMS connection → Moodle courses → assignments → feedback / LMS evidence
- DID, credential shares, verification, audit logs, notifications

## Apply

```bash
supabase db push
# or run the migration SQL in the Supabase SQL editor
```
