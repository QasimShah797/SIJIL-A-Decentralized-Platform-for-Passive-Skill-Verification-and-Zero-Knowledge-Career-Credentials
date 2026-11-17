# SIJIL score proof, version 1

This document covers the learner and recruiter flow that uses the existing `score-threshold-v1` Groth16 artifacts. Those artifacts were not regenerated.

## What the mathematics proves

A valid proof shows that the prover knows a score and a blinding value such that:

- the score and the threshold are integers from 0 to 100
- the score is greater than or equal to the public threshold
- `Poseidon(domain, score, blinding, learnerId, attemptId)` equals the public commitment

The public signals are only the threshold and the commitment. The score and the blinding are not public outputs.

A valid proof does not, by itself, prove who issued the credential, who owns it, that the assessment was graded honestly, that the credential is unrevoked, or that a blockchain anchor exists. Those checks are done beside the proof.

## What the application adds

1. A recruiter who can open a share link creates a request for a minimum from 0 to 100. The screens offer 60, 70, and 80.
2. The request expires after 24 hours and can be accepted once.
3. The signed-in learner reviews the minimum, sees their own score, generates the proof in the browser, and approves sending it.
4. The server checks the issuer signature, document hash, holder, commitment, requested threshold, Groth16 proof, database revocation, and the ledger when Fabric is enabled.
5. If Fabric is disabled or cannot be reached, the ledger line is `unavailable`. That is not recorded as a successful anchor. The request can still be accepted for the signature and the proof, and the message says it is not a ledger confirmation.
6. A credential that merely contains a commitment is no longer marked `evidence_unavailable`. Its privacy-proof check stays `not_checked`, and the overall verified badge stays off until a proof is actually checked.

## Freshness limit

The v1 circuit has no recruiter challenge or nonce in its public inputs. Adding one requires a new circuit and a new trusted setup. That setup was not run.

The request id is single-use and is checked on the server. The Groth16 proof itself can be reused for a later request if the learner submits it again. Do not describe this as cryptographic freshness.

## Security limitations

- The published verification key is a single-contributor development setup. Anyone who kept the trapdoor can forge proofs for this key.
- The server and the learner's own account can read the score opening. Recruiters cannot, through these APIs.
- The learner's browser receives the score and blinding in order to generate the proof. They are not written to browser storage by this flow.
- Meets wasm and zkey are checked against the witness response hashes. The verification key digest is pinned in source.
- Below-threshold and GitHub proving keys are not part of this flow.
- The fixed 60% background policy is unchanged and is separate from a recruiter-selected minimum.
- Hosted Supabase was not modified. Until `20261115170000_zkp_score_verification_requests.sql` is applied, request APIs return 503 and the screens say the table is not ready.

## Migration checklist

Do not apply this automatically.

1. Review `supabase/migrations/20261115170000_zkp_score_verification_requests.sql`.
2. Apply it in a reviewed change to the hosted database. Client roles are denied. Only the service role can read and write the table.
3. Confirm the backend process can read `zkp-artifacts/score-threshold-v1` and that the three files still match:
   - wasm `aa87825cd7848d8392247d470709cf4f74c33877a48075882b5bcba8b7c7f6b8`
   - zkey `dc4b128541eac571589effd8eb183ed755ca0333ba0f5d9fdc4a7f4da08ebbdb`
   - verification key `aff48cb87a787b102046765a05cd0515de3b753707cad93350a515539070b7e1`
4. Leave `FABRIC_ENABLED=false` until a separate Fabric decision. The proof result must show the blockchain line as not checked.
5. Do not replace the verification key without an explicit ceremony approval.

## Commands that were run on Windows

Node is at `C:\Program Files\nodejs` and is not on the default `PATH`. The backend `node_modules` copy of esbuild is not the Windows binary. Point `ESBUILD_BINARY_PATH` at an esbuild `0.28.1` Windows executable before `tsx`. Do not use the repository's `0.25.12` binary for that host package.

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
cd C:\project\SIJIL-LATEST
node .\node_modules\typescript\bin\tsc -p tsconfig.app.json --noEmit
npx vitest run src/lib/zkp/proof-signals.test.ts src/components/wallet/ZkpProofCard.test.tsx src/components/recruiter/AssessmentProofRequestCard.test.tsx src/lib/sharing/guide.test.ts src/lib/zkp/generate-score-proof.test.ts

$env:ESBUILD_BINARY_PATH = "C:\Users\PMLS\AppData\Local\Temp\esbuild-win32-0.28.1\package\esbuild.exe"
cd C:\project\SIJIL-LATEST\backend
node .\node_modules\typescript\bin\tsc -p tsconfig.json --noEmit
node .\node_modules\typescript\bin\tsc -p tsconfig.test.json --noEmit
node .\node_modules\tsx\dist\cli.mjs --test src/services/zkp-score-request.test.ts src/services/credential-verify.test.ts src/services/zkp-verify.test.ts src/services/zkp-artifacts.test.ts
```

Results from this session:

- Frontend typecheck: passed.
- Frontend tests above: 19 passed. That includes a real Groth16 proof for threshold 60 and rejection of a score below that threshold.
- Backend typecheck, including the test project: passed.
- Score-request tests: 8 passed. Real proofs for a private score of 60 and of 73, both against a requested minimum of 60. A score of 59 with its own commitment is rejected by the circuit. Tampered proofs, swapped commitments, a different verification key, the wrong learner, expiry, revocation, a bad signature, a second submission, and a ledger hash mismatch are rejected. A disabled ledger is recorded as not checked and is not described as a ledger confirmation.
- Credential verification tests: passed, including a commitment with no proof staying `not_checked` and off the overall verified flag.
- Existing reusable-proof and verification-key tests: 16 passed.
- `zkp-automation-mapping.test.ts`: 6 failed because `score_below_final.zkey` and `zkp-artifacts/github-contributions-v1/` are not on disk. The meets half of the assessment test ran. Those missing proving keys were not regenerated.

The full `backend npm test` script was not run. It also typechecks and runs the GitHub and below-threshold suites, which need the missing proving keys.

In the app, with the backend running and the new table applied locally:

1. Sign in as a learner, open an issued assessment credential, and read the private score proof card.
2. Choose Show my private score. Confirm the percentage is visible only in that card.
3. Sign in as a recruiter, open the learner's share link, and request 70%.
4. As the learner, approve the 70% request only if the private score is at least 70. Generate and send the proof.
5. As the recruiter, choose Check result. Confirm the score is absent, mathematics and signature are separate from the blockchain line, and a second check does not accept the same request again.
6. Decline a new request and confirm it cannot be accepted afterward.
7. Stop or expire the share link and confirm the shared page no longer shows the credential fields. A result already returned is not deleted from the recruiter's earlier response.

## Version 2 challenge binding

This was investigated and not built. A new ceremony needs approval.

The v1 public signals are `[threshold, commitment]`. A Groth16 proof is bound only to those two values. A new request with the same threshold and the same credential can be satisfied by the same proof. The application stops that by consuming the request row once. That check is not inside the proof.

A v2 circuit would add one public input, `challenge`, and constrain it so the compiler cannot delete it. The verifier would require the public signals to be `[threshold, commitment, challenge]`, where `challenge` is a field element derived from the request id, recruiter audience, credential URI, threshold, and expiry. The score commitment would stay the same, so existing credentials would not need a new score opening. The R1CS would still change, so v1 wasm, zkey, and verification key cannot verify v2 proofs.

A production setup for that circuit would be a multi-party ceremony with a published transcript. The new verification-key hash would be pinned in source beside the v1 hash. v1 requests would keep verifying under the current key until they expire. No v2 key was generated.

## Localhost test

Code completion is not the same as a live signed-in run. This session did not start the app or apply the new table.

Use the existing local environment files. Do not print them, commit them, or point Fabric at a network. Leave `FABRIC_ENABLED` unset or `false`.

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
$env:ESBUILD_BINARY_PATH = "C:\Users\PMLS\AppData\Local\Temp\esbuild-win32-0.28.1\package\esbuild.exe"

# Terminal 1
cd C:\project\SIJIL-LATEST\backend
npm run dev

# Terminal 2
cd C:\project\SIJIL-LATEST
npm run dev
```

The site is `http://localhost:8080`. The API defaults to port 5000. The frontend needs `VITE_API_BASE_URL` set to that API, including the `/api` prefix, in the existing frontend env file.

The request buttons return "not ready" until `supabase/migrations/20261115170000_zkp_score_verification_requests.sql` is applied to the database this backend uses. Do not apply that file to hosted Supabase unless that change is separately approved. If this backend's Supabase URL is the hosted project, the live request cannot be completed yet.

When the table is on the local database:

1. Sign in as a learner and open an issued assessment credential. Read Private score proof.
2. Choose Show my private score. The percentage stays in that card. Hide it again and confirm it disappears.
3. Sign in as a recruiter, open the learner's share link, and request 70%. The page should say it is waiting. It should not say the policy was accepted.
4. As the learner, approve only if the private score is at least 70. Generate and send the proof. Ready appears only after the server accepts.
5. As the recruiter, choose Check result. Confirm the score is absent. Mathematics, signature, document, holder, revocation, and blockchain are separate lines. With Fabric off, blockchain says Not checked.
6. Check the same request again. It stays accepted once and does not become a second acceptance.
7. Create another request and decline it. A declined request cannot be accepted afterward.

## Files

- `src/lib/zkp/generate-score-proof.ts` — a score equal to the threshold is a valid public signal
- `backend/src/services/zkp-score-request.ts` — authoritative request decision
- `backend/src/services/credential-verify.ts` — commitment no longer forces `evidence_unavailable`
- `backend/src/services/zkp-policy-verify.service.ts` — the fixed 60% recruiter view rechecks the issuer signature
- `supabase/migrations/20261115170000_zkp_score_verification_requests.sql` — not applied to hosted Supabase
