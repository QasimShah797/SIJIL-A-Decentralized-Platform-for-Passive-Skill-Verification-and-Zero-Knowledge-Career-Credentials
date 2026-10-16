# SIJIL SSI Phase 2 — DID-bound credential issuance

Phase 2 binds **newly issued** learner credentials to the proven Ed25519 `did:key` registered in Phase 1. Issuer Ed25519 signatures, wallet-ready eligibility, duplicate protection, Fabric anchoring, and historical credentials are unchanged.

## Issuance behavior

`POST /api/credentials/issue` (learner JWT required):

1. Authenticate the learner (`authMiddleware` + `requireLearner`).
2. Load the skill and supporting records; run the existing **wallet_ready / in_wallet** eligibility gate.
3. If a credential already exists for `(user_id, skill_name)`, **return it as issued**. Do not rewrite `holder_did`, do not re-sign, do not require SSI.
4. For a **new** insert, look up `learner_ssi_identities` **by JWT `user_id` only**. The request body is `{ skillId }` (strict). Client DID / fingerprint / private key fields are rejected.
5. Require a canonical Ed25519 `did:key` owned by that user.
   - No row → **409** (`Activate a learner SSI identity…`)
   - Table missing → **503** (apply Phase 1 migration)
   - Placeholder / invalid DID → **409**
   - Row `user_id` mismatch → **403**
6. Use that DID as both `credentials.holder_did` and `credential_document.credentialSubject.id`.
7. Hash and sign the document with the **existing issuer** Ed25519 key (`eddsa-jcs-2022`). The learner private key never leaves the browser and is never written to the credential.
8. Insert `anchor_status: pending`. The Fabric worker is unchanged and still anchors the SHA-256 of the signed document.

`learner_profiles.holder_did` is **not** updated. It may remain a Phase 1 placeholder. Recruiter / public verify uses the stored credential document, not the profile DID.

## What is not rewritten

- Existing `credentials` rows (placeholder `holder_did`, proofs, hashes, Fabric tx ids)
- Issuer keys and verification method (`did:web:…#key-1`)
- Ledger verify (hash + issuer signature + Fabric)
- Institution portal (still 404)

## Recruiter verification

The same `evaluateCredentialVerification` path accepts:

- Historical credentials whose `credentialSubject.id` is a UUID placeholder DID
- New credentials whose `credentialSubject.id` is a real `did:key`

“Blockchain verified” still means **issuer signature + Fabric**, not learner-held key control. Learner-signed presentations are a later phase.

## Manual end-to-end (after local review)

Do not run this from an agent session against live data unless a lead approves issuance.

1. `cd backend && FABRIC_ENABLED=false npm run dev`
2. `npm run dev` (frontend :8080)
3. Sign in as a learner with SSI Identity **Active** in Wallet.
4. Take a **new** wallet-ready skill with no credential yet.
5. Issue from Validation. Confirm `holderDid` / `credentialSubject.id` equal the wallet SSI DID.
6. Public / recruiter verify still returns verified (or pending_anchor if Fabric is off).
7. Repeat Issue: same credential returned, DID unchanged.
8. A learner without SSI Identity gets 409; Issue does not create a row.
9. Network tab: `/api/credentials/issue` body is `{ "skillId": "…" }` only.

## Safety

This phase adds **no** SQL migration and does not modify live credentials. Do not start the Fabric worker, submit ledger transactions, or re-sign historical documents to complete Phase 2.
