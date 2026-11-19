# SIJIL local setup

This is the beginner guide for cloning SIJIL and running it on your own computer. It does not deploy the app, send email, or change the shared database.

Use the `main` branch. Do not check out an old feature branch.

## What is shared, and what is yours

| Item | Shared or local | What to do |
| --- | --- | --- |
| Supabase project (accounts, tables, files) | Shared | Ask the project lead for the project URL, the anon key, and the service-role key. Send those in a private chat, never in Git. |
| Existing learner and recruiter records | Shared | Your local app reads and writes the same hosted database. Do not run `supabase db push`. |
| GitHub OAuth app | Shared | Use the team client id and client secret so GitHub sign-in matches the registered callback. |
| Edge Functions already deployed | Shared | Do not redeploy them unless the lead asks. |
| Frontend and backend processes | Local | Each person runs their own apps on ports 8080 and 5000. |
| `backend/.env` and `.env.local` | Private | Copy the example files and fill them in on your machine only. |
| Gmail SMTP app password | Private unless the lead shares one mailbox | Leave SMTP blank if you only need the screens. Mail is not sent when SMTP is blank. |
| Issuer signing key | Shared if you must verify existing credentials | Generate a new key only for a private experiment. Do not replace the team key. |
| Fabric certificates and private keys | Local | They are created on your machine by the Fabric scripts and are not in Git. |

The Supabase anon key is allowed in the frontend. The service-role key is allowed only in `backend/.env`.

## 1. Install tools

- Git
- Node.js 20 or newer
- npm 10 or newer

Fabric is optional. Install Docker Desktop only if you will run the local blockchain. The normal learner and recruiter screens do not need it.

Check the tools:

```powershell
node -v
npm -v
git --version
```

## 2. Clone

```powershell
git clone https://github.com/QasimShah797/SIJIL-A-Decentralized-Platform-for-Passive-Skill-Verification-and-Zero-Knowledge-Career-Credentials.git
cd SIJIL-A-Decentralized-Platform-for-Passive-Skill-Verification-and-Zero-Knowledge-Career-Credentials
git checkout main
```

## 3. Frontend

From the repository root:

```powershell
npm install
Copy-Item .env.example .env.local
```

On macOS or Linux, use `cp .env.example .env.local`.

Edit `.env.local` and replace only the placeholders:

- `VITE_SUPABASE_URL` — shared project URL
- `VITE_SUPABASE_ANON_KEY` — anon key, not the service-role key
- `VITE_API_BASE_URL` — `http://localhost:5000/api`
- `VITE_GITHUB_CLIENT_ID` — team GitHub OAuth client id
- `VITE_GITHUB_REDIRECT_URI` — `http://localhost:8080/auth/github/callback`
- `VITE_MOODLE_SITE_URL` — optional public Moodle site. Never put a Moodle token here.

Start the site:

```powershell
npm run dev
```

Open `http://localhost:8080`.

## 4. Backend

Open a second terminal:

```powershell
cd backend
npm install
Copy-Item .env.example .env
```

Edit `backend/.env`:

- `SUPABASE_URL` and `SUPABASE_ANON_KEY` — same project as the frontend
- `SUPABASE_SERVICE_ROLE_KEY` — server only
- `PRESENTATION_SIGNING_SECRET` — at least 32 characters, and the same value the team uses for existing share links
- `FRONTEND_URL` and `CORS_ORIGIN` — `http://localhost:8080`
- `GITHUB_OAUTH_CLIENT_ID` and `GITHUB_OAUTH_CLIENT_SECRET` — same GitHub OAuth app
- `SMTP_USER`, `SMTP_PASS`, and `EMAIL_FROM` — optional. Use a Gmail App Password, not a normal Gmail password. Leave them empty to run without sending mail.
- `FABRIC_ENABLED` — keep `false`
- `FABRIC_ALLOW_ADMIN_IDENTITY` — keep `false`

Start the API:

```powershell
npm run dev
```

Health check: open `http://127.0.0.1:5000/api/health`. A healthy response says `"status":"ok"`.

If startup stops with “FABRIC_ENABLED refuses the Org1 Admin certificate”, set `FABRIC_ENABLED=false` and start again. Do not turn on `FABRIC_ALLOW_ADMIN_IDENTITY`.

## 5. Fabric (optional)

Skip this section for recruiter screens, learner screens, and email tests.

Fabric is a local blockchain. Each computer has its own network, certificates, and keys. Those files stay in `fabric/fabric-samples/`, which Git ignores. They are not the same as the shared Supabase data.

From WSL or macOS/Linux, after Docker is running:

```bash
chmod +x fabric/scripts/setup.sh fabric/scripts/teardown.sh
./fabric/scripts/setup.sh
```

That downloads Fabric samples and binaries, creates the `sijil` channel, and deploys the `credentialanchor` chaincode. Only after a non-admin `sijil-app` identity exists should you set `FABRIC_ENABLED=true` and point `FABRIC_CERT_PATH` and `FABRIC_KEY_PATH` at that identity. The Org1 Admin certificate is refused on purpose.

While Fabric is off, credential anchoring stays unavailable. That does not block the frontend, Supabase, or interview email.

More chaincode notes are in [TEAMMATE_SETUP.md](TEAMMATE_SETUP.md).

## 6. Database migrations

SQL files live in `supabase/migrations/`. They describe changes to the shared database.

Do not run `supabase db push`. That can apply every pending file to the hosted project.

Two recent files are already applied on the shared project:

- `supabase/migrations/20261118120000_scheduled_interviews_time_zone.sql` adds a nullable interview timezone.
- `supabase/migrations/20261118133000_peer_review_invite_email_delivery.sql` adds invitation delivery status.

Do not run them again. If a future migration is required, the project lead will give you one SQL file to review before anyone runs it in the Supabase SQL Editor.

## 7. Checks you can run

Frontend, from the repository root:

```powershell
npm run typecheck
npm test
```

Backend:

```powershell
cd backend
npx tsc --noEmit
$env:FABRIC_ENABLED='false'
npx tsx --test src/utils/interviewEmail.test.ts src/services/interview-delivery.test.ts src/utils/contributor-invite-email.test.ts src/utils/invite-email-delivery.test.ts
```

## 8. Do not do these on a first clone

- Do not commit `.env`, `.env.local`, or `backend/.env`.
- Do not commit certificates, `priv_sk`, or `*.pem` files.
- Do not set `FABRIC_ALLOW_ADMIN_IDENTITY=true`.
- Do not run `supabase db push` or deploy Edge Functions.
- Do not run `npm run e2e:ledger`.
- Do not send a real interview or review email until the lead names the test inbox.
