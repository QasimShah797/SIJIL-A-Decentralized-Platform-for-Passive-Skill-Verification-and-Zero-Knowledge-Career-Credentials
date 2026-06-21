# SIJIL Backend

Custom Node.js + Express + TypeScript API layer for SIJIL. Sits between the React frontend and Supabase, handling SIJIL-specific business logic while Supabase remains the database, auth, and storage provider.

## Purpose

This backend provides a structured API for:

- Skill declaration and competency pipeline management
- Evidence submission and status tracking
- Institution attestation (approve / reject / clarification)
- Verifiable credential issuing with mock SHA-256 proof hashes
- Recruiter verification with selective disclosure support

Supabase is **not replaced**. The backend uses the Supabase **service role key** server-side only to perform privileged operations. The frontend continues to use Supabase Auth directly; it sends JWT access tokens to this API in the `Authorization` header.

## Architecture

```
React Frontend  →  Express Backend (/api)  →  Supabase PostgreSQL / Auth / Storage
                                              →  Future Blockchain / ZKP Layer
```

## Install

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your Supabase URL, service role key, and anon key
```

## Run

```bash
# Development (hot reload)
npm run dev

# Production build
npm run build
npm start
```

Default port: **5000** (`PORT` in `.env`).

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | HTTP port (default `5000`) |
| `NODE_ENV` | `development` \| `production` \| `test` |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key — **never expose to frontend** |
| `SUPABASE_ANON_KEY` | Anon key — used only for JWT verification |
| `CORS_ORIGIN` | Frontend origin (default `http://localhost:8080`) |

## API Routes

All routes are prefixed with `/api`.

### Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Service health check |

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

### Attestation (institution)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/attestation/queue` | Attestation queue |
| POST | `/attestation/approve` | Approve attestation |
| POST | `/attestation/reject` | Reject attestation |
| POST | `/attestation/clarification` | Request clarification |

### Credentials

| Method | Path | Role | Description |
|--------|------|------|-------------|
| POST | `/credentials/issue` | learner | Issue credential with proof hash |
| GET | `/credentials/:id` | any auth | Get credential by URI |
| GET | `/credentials/wallet/:learnerId` | any auth | Wallet credentials |
| POST | `/credentials/share` | learner | Create selective disclosure presentation |
| POST | `/credentials/revoke-share` | learner | Revoke shared presentation |

### Recruiter

| Method | Path | Description |
|--------|------|-------------|
| GET | `/recruiter/verify/:credentialId` | Verify credential / presentation |
| GET | `/recruiter/candidate/:candidateId` | Candidate summary |
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
- **Database**: Backend reads/writes the same tables (`declared_skills`, `supporting_records`, `attestations`, `credentials`, `presentations`, etc.) using the service role client.
- **Storage**: File uploads remain on the frontend via Supabase Storage; backend handles metadata in `supporting_records`.
- **RLS**: Service role bypasses RLS; authorization is enforced in backend middleware (`auth.middleware`, `role.middleware`).

## Frontend Integration

Set in frontend `.env`:

```
VITE_API_BASE_URL=http://localhost:5000/api
```

The frontend API client (`src/services/api/`) calls this backend when available and falls back to direct Supabase logic if the API is unreachable.
