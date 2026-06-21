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
│  Business Logic     │  Skills · Evidence · Attestation · Credentials
└──────────┬──────────┘
           │  Service role (server-side only)
           ▼
┌─────────────────────┐
│      Supabase       │  PostgreSQL · Auth · Storage · Edge Functions
└──────────┬──────────┘
           │  Future
           ▼
┌─────────────────────┐
│ Blockchain / ZKP    │  Proof anchoring & selective disclosure proofs
└─────────────────────┘
```

### Components

| Layer | Role |
|-------|------|
| **React frontend** | UI, Supabase Auth login/signup, direct Supabase Storage uploads, API calls with Supabase fallback |
| **Express backend** | SIJIL business logic: skill pipeline, evidence, attestation decisions, credential issuing, recruiter verification |
| **Supabase** | Persistent database, authentication, file storage, edge functions (GitHub OAuth, LMS sync, etc.) |
| **Future ZKP/chain** | Cryptographic proof anchoring beyond mock SHA-256 hashes |

The frontend continues to work fully via Supabase when the backend is offline. Set `VITE_API_BASE_URL` to enable the custom API layer.

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
# Configure SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
npm run dev
```

See [backend/README.md](./backend/README.md) for full API documentation.

## Project Structure

```
SIJIL-new/
├── src/                    # React frontend
│   ├── services/api/       # Backend API client (with Supabase fallback)
│   ├── lib/db/             # Data access (API-first, Supabase fallback)
│   ├── pages/              # Role-based pages (learner, institution, recruiter)
│   └── integrations/     # Supabase client & types
├── backend/                # Express API
│   └── src/
│       ├── routes/         # HTTP routes
│       ├── controllers/    # Request handlers
│       ├── services/       # Business logic
│       ├── middleware/     # Auth, roles, errors
│       └── validators/     # Zod schemas
└── supabase/               # Migrations & edge functions
```

## Environment Variables

Frontend (`.env`):

- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase anon JWT key
- `VITE_API_BASE_URL` — Backend API base (e.g. `http://localhost:5000/api`)

Backend (`backend/.env`):

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`
- `PORT`, `CORS_ORIGIN`

## License

Final year project.
