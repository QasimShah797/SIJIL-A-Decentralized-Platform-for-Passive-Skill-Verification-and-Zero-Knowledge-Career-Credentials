# SIJIL teammate setup

This guide is for cloning SIJIL on a **new machine** and running the learner, recruiter, and (optional) Fabric stack. It does not issue credentials, submit ledger transactions, or deploy anything.

## Shared vs local

| Resource | Where it lives | Notes |
| --- | --- | --- |
| Supabase project (Postgres, Auth, Storage, Edge Functions) | Shared cloud project | Teammates use the same `SUPABASE_URL` / anon key from the team vault. Do **not** put `service_role` in frontend env. |
| Express API (`backend/`) | Local process, port **5000** | Each machine runs its own Node process. |
| Vite frontend (`src/`) | Local process, port **8080** | `VITE_API_BASE_URL=http://localhost:5000/api` |
| Docker / Fabric test-network | **Local** volumes and identities | Your `fabric/fabric-samples/` MSP keys are not in git. A teammate must bring up their own network to submit anchors. |
| `.env` / `.env.local` | **Local only** | Copy from `*.example`. Never commit. |
| Issuer Ed25519 keys | **Local** (`ISSUER_ED25519_*`) | Generate with `npm run generate:issuer-key`. Existing production credentials were signed with the team issuer key — do not overwrite that key in a shared `.env` without coordinating. |
| Institution portal | Not in this handoff | `/institution/*` and `/login/institution` render 404. Do not restore it. |

Existing issued credentials and recruiter shares live in the **shared Supabase** database. Local Fabric cannot re-create those on-chain hashes unless you use the same network — treat on-chain verify as optional on a fresh laptop.

---

## 1. Prerequisites

- **OS:** Windows 11 + **WSL2** (Ubuntu) or native Linux/macOS
- **Node.js** 20+ (22 is fine)
- **npm** 10+
- **Git**
- **Docker Engine + Compose v2** (only if you will run Fabric)
- ~4 GB RAM free for Fabric images

Check:

```bash
node -v
npm -v
docker ps    # optional; required for Fabric
```

## 2. Clone

```bash
git clone https://github.com/QasimShah797/SIJIL-A-Decentralized-Platform-for-Passive-Skill-Verification-and-Zero-Knowledge-Career-Credentials.git
cd SIJIL-A-Decentralized-Platform-for-Passive-Skill-Verification-and-Zero-Knowledge-Career-Credentials
git checkout feature/ssi-holder-keys   # current integration branch unless the team moved it
```

## 3. WSL and Docker (Windows)

1. Install WSL2 Ubuntu from Microsoft Store.
2. Install Docker Desktop and enable **WSL integration** for that distro.
3. Open the project **inside WSL** (`\\wsl$\...`), not a `/mnt/c` bind-mount, so file watching and Fabric volumes work.
4. Confirm: `docker ps` from the Ubuntu shell.

## 4. Frontend setup

```bash
npm install
cp .env.example .env.local
```

Edit `.env.local` (placeholders only in git):

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Shared project URL |
| `VITE_SUPABASE_ANON_KEY` | **anon** JWT only |
| `VITE_API_BASE_URL` | `http://localhost:5000/api` |
| `VITE_GITHUB_CLIENT_ID` | Same GitHub OAuth app as backend |
| `VITE_GITHUB_REDIRECT_URI` | `http://localhost:8080/auth/github/callback` |

```bash
npm run dev          # http://localhost:8080
npm run typecheck
npm test
npm run build
```

## 5. Backend setup

```bash
cd backend
npm install
cp .env.example .env
```

Required in `backend/.env`:

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Same project as frontend |
| `SUPABASE_ANON_KEY` | Anon JWT |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only; never in Vite env |
| `PRESENTATION_SIGNING_SECRET` | ≥ 32 characters; must match Edge Function secret for existing shares |
| `ISSUER_ED25519_PRIVATE_KEY` / `PUBLIC_KEY` | Base64 PEMs from `npm run generate:issuer-key` (or the team vault for verifying existing VCs) |
| `CORS_ORIGIN` / `FRONTEND_URL` | `http://localhost:8080` |
| `GITHUB_OAUTH_CLIENT_SECRET` | Same OAuth app as `VITE_GITHUB_CLIENT_ID` |
| `FABRIC_ENABLED` | `false` until your local test-network is up |

Generate a **new** issuer key only for a private sandbox:

```bash
npm run generate:issuer-key
```

Run (worker stays a no-op while Fabric is disabled):

```bash
# Recommended until Fabric is up — process-only override, do not edit .env
FABRIC_ENABLED=false npm run dev
```

API: `http://localhost:5000/api`  
Health: `GET http://localhost:5000/api/health`

```bash
npm --prefix backend test
npm --prefix backend run build
```

## 6. Supabase configuration

- Auth, tables, and Storage are on the **shared** project.
- Frontend and backend must use the **same** project URL.
- Edge Functions (`github-sync`, `rapid-task`, `public-credential`, …) are already deployed on that project. **Do not deploy** from a teammate machine unless a lead asks you to.
- `PRESENTATION_SIGNING_SECRET` on Express must match the Edge secret or existing share links fail HMAC checks.
- Regenerating `src/integrations/supabase/types.ts` is optional (`supabase gen types`). The app client is untyped because generated types lag live tables such as `supporting_records`.

## 7. Fabric network setup (optional)

Local only. Skip this if you only need UI + API against shared Supabase.

From repo root (bash / WSL):

```bash
chmod +x fabric/scripts/setup.sh fabric/scripts/teardown.sh
./fabric/scripts/setup.sh
```

This downloads Fabric 2.5.12 samples/binaries (gitignored), creates channel `sijil`, and deploys chaincode `credentialanchor` (contract `CredentialAnchor`).

Then set in `backend/.env` (paths are examples; use files **on your machine**):

```
FABRIC_ENABLED=true
FABRIC_PEER_ENDPOINT=localhost:7051
FABRIC_MSP_ID=Org1MSP
FABRIC_CHANNEL=sijil
FABRIC_CHAINCODE=credentialanchor
FABRIC_CONTRACT_NAME=CredentialAnchor
FABRIC_CERT_PATH=../fabric/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp/signcerts/cert.pem
FABRIC_KEY_PATH=../fabric/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp/keystore/priv_sk
FABRIC_TLS_CERT_PATH=../fabric/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
FABRIC_TLS_OVERRIDE_HOST=peer0.org1.example.com
```

**Do not commit** those PEM/keystore files.

Leave `FABRIC_ENABLED=false` if the network is down. Public verify then returns `pending_anchor` or `ledger_unavailable` — **never treat those as verified**.

When `FABRIC_ENABLED=false` but peer paths are valid, Express may still **evaluate** an existing anchor (read-only). That does not submit `AnchorCredential`. Do not start an extra worker, and do not run `npm run e2e:ledger`.

## 8. Chaincode

Unit tests (no Docker):

```bash
cd fabric/chaincode/credential-anchor
npm install
npm test
```

Rebuild/deploy only if you change chaincode (needs a running test-network):

```bash
cd fabric/chaincode/credential-anchor
npm install
npm run build
# then fabric-samples test-network deployCC — coordinate with the team
```

## 9. Safe read-only verification

Replace the credential UUID only if you have a real issued id.

```bash
curl -sS http://localhost:5000/api/health
curl -sS http://localhost:5000/api/public/credentials/<CREDENTIAL_UUID>/verify
cd backend && FABRIC_ENABLED=false npm run check:fabric    # optional; probes Gateway, does not submit
```

Do **not** run:

- `npm run e2e:ledger`
- `POST /api/credentials/issue`
- credential revoke endpoints
- Fabric `AnchorCredential` / `RevokeCredential` submits
- `supabase db push` / migrations
- `supabase functions deploy …`

## 10. Common errors

| Symptom | Fix |
| --- | --- |
| Frontend loads but Issue / Wallet share fail | Start backend; set `VITE_API_BASE_URL`. |
| `ledger_unavailable` on a credential that is anchored | Fabric peer down, TLS path wrong, or worker/evaluate client cannot reach `localhost:7051`. Status must stay unverified — do not fake `verified`. |
| `pending_anchor` | Credential exists in Postgres but hash is not on this machine’s ledger. Expected on a new Fabric network. |
| Share page shows unissued skills | Wallet default share scope is **All competencies**. Unissued skills must be labeled **Not verified / No issued credential**. Use **Issued credentials only** to exclude them. |
| GitHub OAuth redirect mismatch | Callback URL on the GitHub App must equal `VITE_GITHUB_REDIRECT_URI`. |
| `PRESENTATION_SIGNING_SECRET` too short | Minimum 32 characters. |
| Docker permission denied | WSL: enable Docker Desktop WSL integration; Linux: add user to `docker` group and re-login. |
| Ports 8080 / 5000 / 7051 in use | Stop the other process. Frontend is 8080, API 5000, Fabric peer 7051. |
| Service-role JWT in a Vite variable | Rotate the key in Supabase. Anon key only in `VITE_*`. |

## Exact first-run commands (copy/paste)

```bash
git clone https://github.com/QasimShah797/SIJIL-A-Decentralized-Platform-for-Passive-Skill-Verification-and-Zero-Knowledge-Career-Credentials.git
cd SIJIL-A-Decentralized-Platform-for-Passive-Skill-Verification-and-Zero-Knowledge-Career-Credentials
git checkout feature/ssi-holder-keys
npm install
cp .env.example .env.local
# edit .env.local with team vault values

cd backend
npm install
cp .env.example .env
# edit .env with team vault values
FABRIC_ENABLED=false npm run dev

# new terminal, repo root
npm run dev
```

Open `http://localhost:8080`.
