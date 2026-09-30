# SIJIL — Skill Integrity & Journey Intelligence Ledger

Verifiable competency credentials platform built for learners, institutions, and recruiters.

## Architecture

```
┌─────────────────────┐
│   React Frontend    │  Vite + TypeScript + Tailwind + shadcn/ui
│   (src/)            │
└──────────┬──────────┘
           │  HTTP /api  (JWT from Supabase Auth)
           ▼
┌─────────────────────┐
│  Express Backend    │  Node.js + TypeScript (backend/)
│  Only writer of     │  RFC 8785 canonical hash · Ed25519 issuer signatures
│  trust-bearing data │  Outbox worker anchors / revokes on Fabric
└──────────┬──────────┘
           │  Service role (server-side only)
           ▼
┌─────────────────────┐
│      Supabase       │  PostgreSQL (credential documents, hashes, outbox)
│                     │  Auth · Storage · Edge Functions
└──────────┬──────────┘
           │  Opaque credentialId + SHA-256 hash (no personal data)
           ▼
┌─────────────────────┐
│ Hyperledger Fabric  │  test-network channel `sijil`
│ CredentialAnchor    │  Hash anchoring + status (active / revoked)
└─────────────────────┘

Public share (Edge Function)
  public-credential
        │  BACKEND_PUBLIC_URL
        ▼
  GET /api/public/credentials/:id/verify   (Express)
        │
        ├─ Postgres  (canonical document, hash, Ed25519 proof)
        └─ Fabric    (CredentialAnchor, when FABRIC_ENABLED=true)
```

Credential **documents and PII stay in Postgres**. Fabric stores only opaque IDs, hashes, DIDs, and status. Recruiter shares use **signed selective disclosure** (HMAC over the disclosed payload) — **not** zero-knowledge proofs.

### Components

| Layer | Role |
|-------|------|
| **React frontend** | UI, Supabase Auth, Storage uploads, API calls with limited Supabase fallback |
| **Express backend** | Skill pipeline, evidence, credentials, Ed25519 signing, Fabric client, outbox worker |
| **Supabase** | Database, auth, file storage, edge functions (GitHub OAuth, LMS sync, public-credential) |
| **Hyperledger Fabric** | Tamper-evident hash anchoring via `CredentialAnchor` chaincode |

Reads may fall back to Supabase; writes to credentials, wallet records, selective-disclosure presentations and trust-bearing skill/evidence fields require the backend. Set `VITE_API_BASE_URL` to enable the API layer. Ledger verification requires the backend (`FABRIC_ENABLED=true` only when the test-network is reachable).

### Verification statuses

Returned by `GET /api/public/credentials/:id/verify` and shown in the UI.

| Status | What triggers it |
|--------|------------------|
| `verified` | Canonical hash matches, Ed25519 signature is valid, the credential is not revoked, and the same hash is active on Fabric |
| `tampered` | Stored document/hash/signature disagree, or the ledger hash does not match the recomputed hash |
| `revoked` | `revoked_at` is set in Postgres, or Fabric reports status `revoked` |
| `pending_anchor` | Integrity checks pass locally but the hash is not on the ledger yet (outbox still pending, or Fabric off before the row is marked anchored) |
| `ledger_unavailable` | Row is marked anchored locally but Fabric is disabled or unreachable — never treated as `verified` |
| `evidence_unavailable` | File-backed evidence could not be read from Storage, exceeded 10 MB, or timed out — never treated as `verified` |
| `legacy_unverified_evidence` | `detail` on a credential issued before `evidenceHashes` existed. Never treated as `verified` |
| `not_found` | No credential exists for that id or URI |

## Quick Start

### Frontend

```bash
npm install
cp .env.example .env
# Configure VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_BASE_URL
npm run dev
```

Build:

```bash
npm run build
npx tsc --noEmit
```

### Backend

```bash
cd backend
npm install
cp .env.example .env
# Configure SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY,
# PRESENTATION_SIGNING_SECRET (min 32 chars), and ISSUER_ED25519_*
# (npm run generate:issuer-key — store the private key outside git)
npm run dev
```

See [backend/README.md](./backend/README.md) for API documentation.

### Fabric test network (GitHub Codespaces)

Scripts are bash (not PowerShell). Use **Codespaces**, WSL2, or Git Bash.

1. Create a Codespace from this repo with **Docker-in-Docker** enabled (`docker ps` must work).
2. From the repo root:

```bash
chmod +x fabric/scripts/setup.sh fabric/scripts/teardown.sh
./fabric/scripts/setup.sh
```

That installs pinned Fabric **2.5.12**, brings up `fabric-samples/test-network` on channel `sijil`, and deploys chaincode `credentialanchor` (contract `CredentialAnchor`). First run downloads images and `fabric-samples/` (gitignored).

3. In `backend/.env` set `FABRIC_ENABLED=true` only after the network is up (peer/MSP/cert paths in `.env.example` match this test-network). Restart the backend so the outbox worker can anchor.
4. Optional end-to-end check — seed a test learner first (see below):

```bash
cd backend
npm run e2e:ledger
```

Tear down:

```bash
./fabric/scripts/teardown.sh
```

Details: [fabric/README.md](./fabric/README.md).

#### Seed a test learner for `npm run e2e:ledger`

The script does **not** create an auth user. It issues against an existing learner:

1. Sign up at `/signup/learner` and complete the profile (this inserts `learner_profiles`).
2. In the Supabase dashboard, copy the user's UUID (`Authentication → Users`, or `learner_profiles.user_id`).
3. From `backend/`:

```bash
# optional — otherwise the script uses the first learner_profiles row
E2E_LEARNER_ID=<learner-uuid> npm run e2e:ledger
```

It then inserts a throwaway `declared_skills` row named `E2E Ledger <timestamp>`, issues/anchors/tampers/revokes that credential, and leaves the skill row in the database.

## Project Structure

```
SIJIL/
├── src/                    # React frontend
│   ├── services/api/       # Backend API client (reads may fall back to Supabase)
│   ├── lib/db/             # Data access (API-first; trust-bearing writes need the backend)
│   └── pages/
├── backend/                # Express API + Fabric gateway client + outbox worker
├── fabric/                 # Chaincode + setup/teardown for test-network
└── supabase/               # Migrations & edge functions
```

## Environment Variables

Frontend (`.env`):

- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase anon JWT key
- `VITE_API_BASE_URL` — Backend API base (e.g. `http://localhost:5000/api`)
- `VITE_GITHUB_CLIENT_ID`, `VITE_GITHUB_REDIRECT_URI` — GitHub OAuth

Backend (`backend/.env`) — see [backend/README.md](./backend/README.md) for the full table. Required for credentials/ledger:

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`
- `PRESENTATION_SIGNING_SECRET` — HMAC secret for signed selective disclosure (min **32** chars)
- `ISSUER_ED25519_PRIVATE_KEY`, `ISSUER_ED25519_PUBLIC_KEY` — base64 PEMs (`npm run generate:issuer-key`)
- `FABRIC_ENABLED` and `FABRIC_*` — Fabric gateway + outbox (leave `false` until the network is reachable)

Edge Function secrets (not frontend `.env`):

- `PRESENTATION_SIGNING_SECRET`
- `BACKEND_PUBLIC_URL` — public SIJIL API origin used by `public-credential` to call `/api/public/credentials/:id/verify` (e.g. `http://localhost:5000`)

## Deployment

1. Apply all Supabase migrations to the live project:

```bash
supabase db push
```

2. Set Edge Function secrets (same values as production backend, never committed):

```bash
supabase secrets set PRESENTATION_SIGNING_SECRET=<at-least-32-random-chars>
supabase secrets set BACKEND_PUBLIC_URL=https://<your-public-api-host>
```

3. Generate the issuer keypair on a trusted machine (`cd backend && npm run generate:issuer-key`). Store `ISSUER_ED25519_PRIVATE_KEY` in the host secret store / `backend/.env` — **not** in git.

4. Set `FABRIC_ENABLED=true` only when the Fabric peer is reachable. Leave it `false` for environments without a network; verification will return `pending_anchor` or `ledger_unavailable`, never a false `verified`.

## Limitations

- The Fabric **test-network is development-only**. It is not a production consortium.
- The ledger is **permissioned**. Tamper-evidence assumes independent organizations operate peers; a single-org test-network cannot provide that.
- Anchoring proves a credential **hash is unchanged since issuance**. It does not prove the original claim (skill, evidence, attestation) was true.
- Shares are **signed selective disclosure**, not zero-knowledge proofs. Hidden fields are omitted from the payload; they are not proven in zero knowledge.
- **Merkle-root wallet anchoring** and **ZK proofs** are future work.

## License

Final year project.
