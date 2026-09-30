# SIJIL Backend

Custom Node.js + Express + TypeScript API layer for SIJIL. Sits between the React frontend and Supabase, handling SIJIL-specific business logic while Supabase remains the database, auth, and storage provider. When Fabric is enabled it is also the **only** writer of trust-bearing credential hashes onto the ledger.

## Purpose

This backend provides a structured API for:

- Skill declaration and competency pipeline management
- Evidence submission and status tracking
- Institution attestation (approve / reject / clarification)
- Verifiable credential issuing: RFC 8785 canonical JSON, SHA-256 hash, Ed25519 issuer signature
- Outbox worker that anchors and revokes those hashes on Hyperledger Fabric
- Recruiter / public verification (integrity + ledger status)
- Signed selective disclosure presentations (HMAC over the disclosed payload — **not** ZK)

Supabase is **not replaced**. The backend uses the Supabase **service role key** server-side only. The frontend continues to use Supabase Auth directly; it sends JWT access tokens to this API in the `Authorization` header.

## Architecture

```
Public share (browser)
      │
      ▼
Edge Function public-credential
      │  BACKEND_PUBLIC_URL
      ▼
GET /api/public/credentials/:id/verify
      │
      ├─ Postgres (canonical document, hash, Ed25519)
      └─ Fabric CredentialAnchor (when FABRIC_ENABLED=true)

React Frontend
      │  JWT
      ▼
Express Backend  ──►  Postgres (credential document, hash, signature, outbox)
      │
      │  outbox worker (FABRIC_ENABLED=true)
      ▼
Fabric test-network  channel sijil / CredentialAnchor
      (opaque credentialId, hash, DIDs, status only)
```

Personal data never goes on chain. `FABRIC_ENABLED=false` (default) skips the worker; verify then returns `pending_anchor` or `ledger_unavailable` rather than `verified`.

### Verification statuses

| Status | What triggers it |
|--------|------------------|
| `verified` | Canonical hash matches, Ed25519 signature is valid, the credential is not revoked, evidence hashes match (or the credential is legacy), and the same hash is active on Fabric |
| `tampered` | Stored document/hash/signature disagree, a file-backed evidence SHA-256 no longer matches Storage, link/GitHub metadata hash drifted, or the ledger hash does not match |
| `revoked` | `revoked_at` is set in Postgres, or Fabric reports status `revoked` |
| `pending_anchor` | Integrity checks pass locally but the hash is not on the ledger yet |
| `ledger_unavailable` | Row is marked anchored locally but Fabric is disabled or unreachable — never treated as `verified` |
| `evidence_unavailable` | File-backed evidence could not be read from Storage, exceeded 10 MB, or timed out — never treated as `verified` |
| `legacy_unverified_evidence` | `detail` on a credential issued before `evidenceHashes` existed. Ledger/signature status is kept; the UI never treats this as `verified` |
| `not_found` | No credential exists for that id or URI |

Legacy credentials issued before `evidenceHashes` existed keep the ledger/signature status and add `detail: "legacy_unverified_evidence"`; they are not reported as `tampered`.

Public `GET /public/credentials/:id/verify` is rate-limited to **20 requests per IP per minute**. File downloads are capped at **10 MB** with an **8s** timeout. Successful lookups are cached in memory for **5 minutes** keyed by `credentialId` + `credential_hash` and dropped on revoke.

## Install

```bash
cd backend
npm install
cp .env.example .env
# Edit .env — see Environment Variables below
npm run generate:issuer-key   # paste PEMs into ISSUER_ED25519_*
```

## Run

```bash
# Development (hot reload; starts the outbox worker)
npm run dev

# Production build
npm run build
npm start

# Unit tests (no Fabric required)
npm test

# Grant reviewer or admin (service role; from backend/)
npm run grant-role -- user@example.com reviewer

# Ledger e2e (requires running test-network + FABRIC_ENABLED=true + a learner)
# Sign up at /signup/learner, then:
#   E2E_LEARNER_ID=<learner-uuid> npm run e2e:ledger
# (omit E2E_LEARNER_ID to use the first learner_profiles row)
npm run e2e:ledger
```

Default port: **5000** (`PORT` in `.env`).

### Fabric in GitHub Codespaces

From the **repo root** (bash, Docker-in-Docker enabled):

```bash
chmod +x fabric/scripts/setup.sh fabric/scripts/teardown.sh
./fabric/scripts/setup.sh
```

Then set `FABRIC_ENABLED=true` in `backend/.env` **only when the network is reachable** (cert paths in `.env.example` already point at `fabric-samples/test-network` Org1 admin). Restart `npm run dev`. Tear down with `./fabric/scripts/teardown.sh`.

Seed a learner before e2e: sign up at `/signup/learner`, copy the user UUID from Supabase `Authentication → Users` (or `learner_profiles.user_id`), then `E2E_LEARNER_ID=<uuid> npm run e2e:ledger`. The script does not create or delete auth users; it inserts a throwaway `declared_skills` row per run.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | HTTP port (default `5000`) |
| `NODE_ENV` | `development` \| `production` \| `test` |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key — **never expose to frontend** |
| `SUPABASE_ANON_KEY` | Anon key — JWT verification |
| `CORS_ORIGIN` | Frontend origin (default `http://localhost:8080`) |
| `FRONTEND_URL` | Frontend origin for invite / share links |
| `PRESENTATION_SIGNING_SECRET` | HMAC secret for signed selective disclosure (min **32** chars). Required. Do not reuse the service role key. |
| `ISSUER_ED25519_PRIVATE_KEY` | Base64 PKCS#8 Ed25519 PEM. Required in production. |
| `ISSUER_ED25519_PUBLIC_KEY` | Base64 SPKI Ed25519 PEM |
| `GITHUB_OAUTH_CLIENT_SECRET` | GitHub OAuth app secret (sign-in) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `EMAIL_FROM` | Peer-review invite email (optional) |
| `APPLE_PASS_*` | Apple Wallet pass (optional; buttons hidden until set) |
| `GOOGLE_WALLET_ISSUER_ID` / `GOOGLE_WALLET_SA_KEY` | Google Wallet (optional) |
| `FABRIC_ENABLED` | `true` to connect to Fabric (default `false`) |
| `FABRIC_PEER_ENDPOINT` | e.g. `localhost:7051` |
| `FABRIC_MSP_ID` | `Org1MSP` |
| `FABRIC_CHANNEL` | `sijil` |
| `FABRIC_CHAINCODE` | `credentialanchor` |
| `FABRIC_CONTRACT_NAME` | `CredentialAnchor` (default) |
| `FABRIC_CERT_PATH` | Path to Org1 admin signcert (file path only; never commit PEM contents) |
| `FABRIC_KEY_PATH` | Path to Org1 admin private key |
| `FABRIC_TLS_CERT_PATH` | Path to peer TLS CA |
| `FABRIC_TLS_OVERRIDE_HOST` | `peer0.org1.example.com` |
| `FABRIC_ANCHOR_INTERVAL_MS` | Outbox poll interval (default `15000`) |
| `FABRIC_ANCHOR_BATCH_SIZE` | Default `10` |
| `FABRIC_ANCHOR_MAX_ATTEMPTS` | Default `8` |
| `FABRIC_ANCHOR_BACKOFF_MS` | Default `5000` |
| `E2E_LEARNER_ID` | Optional learner UUID for `npm run e2e:ledger` |

Edge Function (Supabase secrets, not this file): `BACKEND_PUBLIC_URL` — origin the `public-credential` function uses to call `GET /api/public/credentials/:id/verify`.

## API Routes

All routes are prefixed with `/api`.

### Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Liveness. Response `data` is only `{ "status": "ok" }` |
| GET | `/health/outbox` | admin | Ledger outbox counts (`pendingAnchors`, `failedAnchors`) |

### Skills (learner)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/skills` | List declared skills |
| POST | `/skills` | Create skill |
| GET | `/skills/:id` | Get skill by ID |
| PATCH | `/skills/:id` | Update skill |
| DELETE | `/skills/:id` | Delete skill |

### Evidence (learner)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/evidence` | Submit evidence |
| GET | `/evidence/:skillId` | List evidence for skill |
| PATCH | `/evidence/:id/status` | Update evidence status |

### Roles

| Role | Who grants it | What it can do |
|------|---------------|----------------|
| `learner` | Self-insert on signup (authenticated RLS) | Declare skills, submit evidence, issue/share own credentials |
| `recruiter` | Self-insert on signup (authenticated RLS) | Search; read only disclosed fields on an active share; same ledger verify as public |
| `reviewer` | Service role only | Attestation queue, revoke, institution-student provisioning |
| `admin` | Service role only | Reviewer APIs plus `/health/outbox` and anchor retry |
| `institution` | Legacy alias of `reviewer`; not self-grantable | Same as `reviewer` |

`user_roles.user_id` is UNIQUE — a user holds exactly one role. Authenticated clients may insert only `learner` or `recruiter` for themselves. There is no authenticated UPDATE policy. Reviewer/admin rows can only be written with the service role:

```bash
# from backend/
npm run grant-role -- user@example.com reviewer
npm run grant-role -- user@example.com admin
```

The script deletes any existing `user_roles` row for that email and inserts `reviewer` or `admin`. Do not use it for learner/recruiter.

### Evidence hashing

The backend downloads each `skill-evidence` object (or canonicalizes link/GitHub metadata), stores SHA-256 on `supporting_records.content_hash`, and embeds the sorted hashes in the signed credential document. Learners may upload new files but cannot overwrite or delete objects in that bucket; verify re-hashing is the integrity control. `content_hash`, `source`, and verification flags are writable only as `service_role`.

### Attestation (reviewer)

`institution` is a legacy alias of `reviewer`. Both (and `admin`) may call these routes.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/attestation/queue` | Attestation queue |
| POST | `/attestation/approve` | Approve attestation |
| POST | `/attestation/reject` | Reject attestation |
| POST | `/attestation/clarification` | Request clarification |

### Institution students (reviewer)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/institution/students` | List provisioned students |
| POST | `/institution/students` | Provision a student |

### Credentials

| Method | Path | Role | Description |
|--------|------|------|-------------|
| POST | `/credentials/issue` | learner | Issue signed credential if the skill belongs to the caller, is verified/attested (`wallet_ready` / `in_wallet`), and supporting evidence meets trust-tier rules; enqueue Fabric anchor |
| GET | `/credentials/:id` | owner, or recruiter with an active share (disclosed fields only) | Get credential by URI |
| GET | `/credentials/wallet/:learnerId` | owner, or recruiter with an active share (disclosed fields only) | Wallet credentials (includes `anchorStatus` for the owner) |
| POST | `/credentials/share` | learner | Create signed selective-disclosure presentation |
| POST | `/credentials/revoke-share` | learner | Revoke shared presentation |
| POST | `/credentials/:id/revoke` | reviewer | Revoke issued credential (outbox → Fabric) |
| POST | `/credentials/:id/anchor/retry` | admin | Retry a failed/pending anchor |

### Public ledger / share

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/public/credentials/:credentialId/verify` | No (20 req/IP/min) | Integrity + ledger status: `verified` \| `tampered` \| `revoked` \| `pending_anchor` \| `ledger_unavailable` \| `evidence_unavailable` \| `not_found` (optional `detail: legacy_unverified_evidence`) |
| GET | `/public/credentials/:token` | No | Public share payload (`verified` only when ledger status is `verified`) |
| GET | `/public/issuers/:did` | No | Issuer public key |

### Recruiter

| Method | Path | Description |
|--------|------|-------------|
| GET | `/recruiter/verify/:credentialId` | Same verification service as `/public/credentials/:credentialId/verify` |
| GET | `/recruiter/candidate/:candidateId` | Candidate summary — only with an active, non-revoked, non-expired share |
| GET | `/recruiter/search` | Search candidates (`?q=&skill=&institution=`) |

### GitHub Integrations (learner)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/integrations/github/sync` | Sync GitHub repos as evidence records (no auto-link) |
| GET | `/integrations/github/evidence` | List GitHub evidence records |
| GET | `/integrations/github/sync-status` | Latest sync status |
| GET | `/evidence/unmapped` | Unmapped evidence awaiting review |
| POST | `/skills/:skillId/evidence/link` | Link evidence record to declared skill |
| PATCH | `/evidence/:id/ignore` | Ignore unmapped evidence |

Sync statuses: `Not Synced`, `Syncing`, `Synced`, `Failed`. Evidence statuses: `Unmapped Evidence`, `Mapped`, `Ignored`.

## Response Format

```json
{
  "success": true,
  "message": "OK",
  "data": { }
}
```

Errors:

```json
{
  "success": false,
  "message": "Error description",
  "errors": { }
}
```

## Relation with Supabase

- **Auth**: Frontend authenticates via Supabase Auth. Backend verifies JWTs with `supabase.auth.getUser(token)`.
- **Database**: Backend reads/writes the same tables using the service role client. Trust-bearing credential columns are not writable from the browser.
- **Storage**: File uploads remain on the frontend via Supabase Storage (`skill-evidence`). The backend downloads the object, hashes the bytes, and writes `content_hash`. Authenticated users cannot UPDATE or DELETE objects in that bucket.
- **RLS**: Service role bypasses RLS; authorization is enforced in backend middleware (`auth.middleware`, `role.middleware`). Roles: `learner`, `recruiter`, `reviewer`, `admin`. `institution` is a legacy alias of `reviewer`. Reviewer/admin cannot be self-granted.

## Frontend Integration

Set in frontend `.env`:

```
VITE_API_BASE_URL=http://localhost:5000/api
```

The frontend API client (`src/services/api/`) calls this backend when `VITE_API_BASE_URL` is set. Reads may fall back to Supabase; writes to credentials, wallet records, selective-disclosure presentations and trust-bearing skill/evidence fields require the backend. Ledger verify uses `src/services/api/ledger.api.ts`.
