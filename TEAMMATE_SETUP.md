# SIJIL teammate setup

Clone SIJIL on a new machine and run the learner / recruiter stack against the **shared hosted Supabase** project. This guide does not issue credentials, submit ledger transactions, recreate the database, or deploy Edge Functions.

## Shared vs local

| Resource | Where it lives | Notes |
| --- | --- | --- |
| Supabase project (Postgres, Auth, Storage, Edge Functions) | Shared hosted project `nhzvtqpplfruzocframc` | Use the same `SUPABASE_URL` / anon key from the **team vault**. Do **not** put `service_role` in any frontend env. |
| Express API (`backend/`) | Local process, port **5000** | Each machine runs its own Node process. |
| Vite frontend (`src/`) | Local process, port **8080** | `VITE_API_BASE_URL=http://localhost:5000/api` |
| Moodle LMS | Shared MoodleCloud **or** optional local Moodle + bridge | See Moodle section below. |
| Learner Journey | FE + local BE against hosted data | UI: `/learner/journey` · API: `GET /api/learner/journey` |
| Docker / Fabric test-network | **Local** (optional) | Leave `FABRIC_ENABLED=false` unless you run your own test-network. |
| `.env` / `.env.local` | **Local only** | Copy from `*.example`. Never commit real keys, tokens, or backups. |
| Issuer Ed25519 keys | **Local** (`ISSUER_ED25519_*`) | Use team vault values to verify existing VCs, or generate a sandbox key with `npm run generate:issuer-key` only for a private experiment. |

Existing learners, credentials, and recruiter shares live in the **shared hosted database**. Teammates must **not** recreate, reset, or `db push` that database.

---

## 1. Prerequisites

- **OS:** Windows 11 + **WSL2** (Ubuntu) or native Linux/macOS
- **Node.js** **20+** (22 is fine)
- **npm** 10+
- **Git**
- **Deno** (only if you run the local Moodle → hosted bridge)
- **Docker Engine + Compose v2** (only if you will run Fabric or a local Moodle stack)

```bash
node -v   # must be v20+
npm -v
docker ps    # optional; required for Fabric / local Moodle containers
```

---

## 2. Clone (feature branch)

```bash
git clone https://github.com/QasimShah797/SIJIL-A-Decentralized-Platform-for-Passive-Skill-Verification-and-Zero-Knowledge-Career-Credentials.git
cd SIJIL-A-Decentralized-Platform-for-Passive-Skill-Verification-and-Zero-Knowledge-Career-Credentials
git fetch origin
git checkout review/sijil-security-6l
git pull origin review/sijil-security-6l
```

Use this branch until Moodle bridge + Learner Journey land on `main`.

---

## 3. WSL and Docker (Windows)

1. Install WSL2 Ubuntu from Microsoft Store.
2. Install Docker Desktop and enable **WSL integration** for that distro.
3. Open the project **inside WSL** (`\\wsl$\...`), not a `/mnt/c` bind-mount.
4. Confirm: `docker ps` from the Ubuntu shell.

---

## 4. Hosted Supabase configuration

- Project ref: **`nhzvtqpplfruzocframc`**
- URL shape: `https://nhzvtqpplfruzocframc.supabase.co`
- Frontend and backend must use the **same** hosted project.
- Auth, tables, Storage, and Edge Functions already exist on that project.
- **Do not** run `supabase db reset`, `supabase db push`, or SQL that drops/recreates schemas.
- **Do not** deploy Edge Functions (`supabase functions deploy …`) unless a lead explicitly asks you to.

Copy secrets from the team vault into local env files (placeholders only in git).

---

## 5. Frontend setup

```bash
npm install
cp .env.example .env.local
```

Edit `.env.local` (placeholders — never commit real values):

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://nhzvtqpplfruzocframc.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Hosted **anon** JWT only (team vault) |
| `VITE_API_BASE_URL` | `http://localhost:5000/api` |
| `VITE_GITHUB_CLIENT_ID` | Same GitHub OAuth app as backend |
| `VITE_GITHUB_REDIRECT_URI` | `http://localhost:8080/auth/github/callback` |
| `VITE_MOODLE_SITE_URL` | Optional. Default when unset: MoodleCloud. For local Moodle: `http://localhost:8000` |
| `VITE_MOODLE_SYNC_BRIDGE_URL` | Optional local bridge only: `http://127.0.0.1:8787` |

Never put `service_role`, Moodle tokens, or issuer private keys in any `VITE_*` variable.

```bash
npm run typecheck
npm test
npm run build
npm run dev          # http://localhost:8080
```

---

## 6. Backend setup

```bash
cd backend
npm install
cp .env.example .env
```

Required in `backend/.env` (values from team vault / placeholders in example):

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Same hosted URL as frontend |
| `SUPABASE_ANON_KEY` | Anon JWT |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only; never in Vite env |
| `PRESENTATION_SIGNING_SECRET` | ≥ 32 characters; must match Edge secret for existing shares |
| `ISSUER_ED25519_PRIVATE_KEY` / `PUBLIC_KEY` | Team vault PEMs (base64) for existing credentials |
| `CORS_ORIGIN` / `FRONTEND_URL` | `http://localhost:8080` |
| `GITHUB_OAUTH_CLIENT_SECRET` | Same OAuth app as `VITE_GITHUB_CLIENT_ID` |
| `FABRIC_ENABLED` | **`false`** for normal teammate use |

```bash
# Recommended default — do not enable Fabric until your own test-network is up
FABRIC_ENABLED=false npm run dev
```

API: `http://localhost:5000/api`  
Health: `GET http://localhost:5000/api/health`

```bash
npm --prefix backend test
npm --prefix backend run build
```

---

## 7. Auth and OAuth redirects

Hosted Supabase Auth must allow local FE origins:

- **Site URL / redirect allowlist:** `http://localhost:8080` (and app callback paths as configured)
- **Google:** provider enabled in Supabase Auth; Google Cloud OAuth client allows `http://localhost:8080`
- **GitHub:** OAuth App callback must equal `VITE_GITHUB_REDIRECT_URI`
  (`http://localhost:8080/auth/github/callback`)

Teammates normally do **not** create a new Supabase project; they sign in against the shared hosted Auth.

---

## 8. Moodle: MoodleCloud vs local bridge

### A) Team default — MoodleCloud via hosted Edge

1. Leave `VITE_MOODLE_SITE_URL` unset (defaults to MoodleCloud) **or** set it to the shared MoodleCloud URL from the vault.
2. Do **not** set `VITE_MOODLE_SYNC_BRIDGE_URL`.
3. Sync from Integrations while logged in as a hosted learner whose email exists in MoodleCloud.
4. Moodle webservice token lives only in **hosted Edge secrets** (lead-managed). Never in frontend env.

### B) Optional demo — local Moodle → hosted Supabase (bridge)

Hosted Edge **cannot** reach `http://localhost:8000` on your laptop. Use the local Deno bridge:

```bash
cp env/bridge/moodle-sync.env.example env/bridge/moodle-sync.env
# Fill SUPABASE_* from vault (hosted), MOODLE_* for local Moodle only.
# Never commit env/bridge/*.env

npm run validate:bridge-moodle-env
npm run moodle:serve-bridge    # http://127.0.0.1:8787
```

In `.env.local` (FE):

```bash
VITE_MOODLE_SITE_URL=http://localhost:8000
VITE_MOODLE_SYNC_BRIDGE_URL=http://127.0.0.1:8787
```

Identity for upserts always comes from the **hosted learner JWT**, not a hardcoded local user id.
See `env/bridge/README.md` for details.

---

## 9. Learner Journey

| Layer | Route |
| --- | --- |
| Frontend | `http://localhost:8080/learner/journey` (“My Skill Journey”) |
| Backend | `GET /api/learner/journey` (JWT required) |

Journey reads existing hosted evidence/credential tables through the local Express API. Teammates do **not** need to create new databases for Journey.

---

## 10. Fabric (optional)

Default for all teammates:

```bash
FABRIC_ENABLED=false
```

Skip Fabric setup unless you need on-chain anchoring on your machine. Local Fabric cannot recreate hosted on-chain hashes from another network — treat ledger verify as optional.

If you do run Fabric, follow [fabric/README.md](./fabric/README.md) and only then set `FABRIC_ENABLED=true` with **your** local MSP/TLS paths. Never commit PEM/keystore files.

---

## 11. Do not run (unless a lead asks)

- `supabase db push` / `supabase db reset` / destructive SQL against hosted
- `supabase functions deploy …` (including `moodle-sync` / `github-sync`)
- `npm run e2e:ledger` against shared data without coordination
- Committing `.env`, `.env.local`, `env/**/*.env`, or `*.bak` backups

---

## 12. Safe verification

```bash
curl -sS http://localhost:5000/api/health
# Open http://localhost:8080 and sign in with a hosted learner account
```

---

## Exact first-run commands

```bash
git clone https://github.com/QasimShah797/SIJIL-A-Decentralized-Platform-for-Passive-Skill-Verification-and-Zero-Knowledge-Career-Credentials.git
cd SIJIL-A-Decentralized-Platform-for-Passive-Skill-Verification-and-Zero-Knowledge-Career-Credentials
git checkout review/sijil-security-6l
git pull origin review/sijil-security-6l

npm install
cp .env.example .env.local
# edit .env.local with team vault values (hosted nhzvtqpplfruzocframc)

cd backend
npm install
cp .env.example .env
# edit .env with team vault values
FABRIC_ENABLED=false npm run dev

# new terminal, repo root
npm run dev
```

Open `http://localhost:8080`.
