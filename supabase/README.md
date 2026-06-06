This folder contains Supabase migration helpers for applying profile-related database objects.

Quick options to apply:

1) Supabase SQL Editor (recommended):
   - Open your Supabase project dashboard → SQL Editor → New query.
   - Paste the contents of `apply_profiles.sql` and run the query as a project admin.

2) psql (CLI):
   - Obtain a Postgres connection string with a role that can create tables/triggers (service_role or an owner):
     - `postgres://<user>:<pass>@<host>:5432/<db>?sslmode=require`
   - Run:

```bash
psql "<CONNECTION_STRING>" -f supabase/apply_profiles.sql
```

3) Supabase CLI (if installed):
   - You can also apply migrations via the Supabase CLI or `supabase db push` workflows — consult Supabase docs.

Notes:
- These statements are safe to run on an empty project. If you already applied existing migrations, some statements may fail due to duplicates; in that case inspect the files in `supabase/migrations` and only run the missing ones.
- The app expects the following tables/views/functions: `profiles`, `learner_profiles`, `recruiter_profiles`, `institution_profiles`, `user_roles`, plus triggers and policies for row-level security.

If you want, I can attempt to run these against your database if you provide a connection string (service role). Otherwise follow the steps above and tell me the result.