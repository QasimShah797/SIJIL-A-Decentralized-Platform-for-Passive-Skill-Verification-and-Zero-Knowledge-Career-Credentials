# Local Moodle → Hosted Supabase sync bridge

Hosted `moodle-sync` Edge **cannot** call `http://localhost:8000`. This bridge
runs the **same** `supabase/functions/moodle-sync` code on your machine so it
can reach local Moodle and write (via service role) to hosted Supabase.

```
Browser (JWT) → local moodle-sync (:8787)
                    ├─ Moodle REST http://localhost:8000  (MOODLE_TOKEN server-side)
                    └─ Hosted Supabase REST (service role; identity from JWT only)
```

## Prerequisites

1. Local Moodle up at `http://localhost:8000` with webservice token.
2. FE/BE already pointed at hosted project `nhzvtqpplfruzocframc`.
3. Hosted tables for Moodle sync present (see report). Apply
   `skill_evidence_links` from `20260620120000_github_evidence_records.sql`
   before expecting Journey Moodle skill links (Journey has a mapped_skill
   fallback when the links table is missing).

## Setup (no secret commits)

```bash
cp env/bridge/moodle-sync.env.example env/bridge/moodle-sync.env
cp env/bridge/frontend.env.example env/bridge/frontend.env
# Fill placeholders from backend/.env (hosted keys) + local Moodle token.
# Never commit *.env — only *.example is tracked.

npm run validate:bridge-moodle-env
npm run moodle:serve-bridge
```

In a separate shell, load frontend bridge vars (do not destroy hosted `.env.local`
Supabase URL). Typical approach: merge `VITE_MOODLE_SITE_URL` and
`VITE_MOODLE_SYNC_BRIDGE_URL` into `.env.local` or export them before `npm run dev`.

## Safety

- Do **not** put Moodle tokens or service-role keys in any `VITE_*` variable.
- Do **not** deploy this bridge env to hosted Edge secrets with localhost URLs.
- Do **not** point `VITE_MOODLE_SYNC_BRIDGE_URL` at a non-loopback host.
- Identity for upserts always comes from the learner JWT inside moodle-sync.
