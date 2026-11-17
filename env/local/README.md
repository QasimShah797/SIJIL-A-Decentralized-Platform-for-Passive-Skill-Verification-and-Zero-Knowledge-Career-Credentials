# Local-only Moodle + Supabase env (preparation)

These files configure an **isolated** Moodle integration test against local
Supabase (`http://127.0.0.1:54321`) and Moodle (`https://sijil-lms.duckdns.org`).

## Files

| File | Git | Purpose |
|------|-----|---------|
| `frontend.env.example` | tracked | Template for Vite |
| `moodle-sync.env.example` | tracked | Template for `functions serve` |
| `frontend.env` | **ignored** | Working copy (placeholders until local start) |
| `moodle-sync.env` | **ignored** | Working copy for Edge |

## Frontend key names (must match app)

`src/integrations/supabase/client.ts` and `src/main.tsx` expect:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Plus Moodle filter: `VITE_MOODLE_SITE_URL`

## Edge key names (must match moodle-sync)

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `MOODLE_BASE_URL`, `MOODLE_EXPECTED_SITE_URL`, `MOODLE_TOKEN`

## Safety

1. Never copy hosted `*.supabase.co` URLs or production JWTs into these files.
2. Do not overwrite repo-root `.env.local` (it may point at hosted/dev).
3. Do not modify `supabase/config.toml` or `supabase/.temp/project-ref` for this prep.
4. Do not run `supabase secrets set` against the hosted project.
5. Before sync: `npm run validate:local-moodle-env`

## After `supabase start` (later step — not part of this prep)

1. Run `supabase status` and replace `<LOCAL_SUPABASE_*_PLACEHOLDER>` values.
2. Put a **local** Moodle token into `MOODLE_TOKEN`.
3. Serve Edge:
   `supabase functions serve moodle-sync --env-file env/local/moodle-sync.env`
4. For Vite, load the frontend vars without destroying existing `.env.local`
   (e.g. create `.env.development.local` only if missing, or export vars in a dedicated shell).
