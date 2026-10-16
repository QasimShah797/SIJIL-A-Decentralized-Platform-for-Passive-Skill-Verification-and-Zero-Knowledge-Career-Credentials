# SIJIL SSI Phase 3 — Learner-signed Verifiable Presentations

Phase 3 proves that the **browser-held learner key** presently controls the DID that appears as `credentialSubject.id` / `holder_did` on already-issued credentials. It does **not** re-issue credentials, change issuer Ed25519 proofs, or replace Fabric verification.

Bearer share links (`selective_disclosure_presentations`, HMAC `SignedSelectiveDisclosure`) remain a separate capability. They are not proof of possession.

## Cryptographic protocol

Signing bytes are frozen below. HTTP, wallet UI, and in-memory challenge consume are implemented in this repo. The Postgres migration is prepared but not applied.

### What is signed

The learner signs the **UTF-8 encoding** of the RFC 8785 (JCS) serialization of `PresentationSigningClaims`:

```text
Ed25519( UTF-8( RFC8785(claims) ) )
```

`claims` always contains:

| Field | Meaning |
| --- | --- |
| `protocol` | `SIJIL-SSI-PRESENT-v1` |
| `purpose` | `present-credentials` |
| `challengeId` | UUID of this presentation challenge |
| `nonce` | Canonical unpadded base64url (≥ 16 random bytes) |
| `audience` | Intended verifier / domain (printable ASCII, no spaces) |
| `holderDid` | Canonical Ed25519 `did:key` |
| `credentials` | Sorted `{ id, hash }` pairs — DB UUID + SHA-256 of the **unsigned** credential document |
| `issuedAt` / `expiresAt` | UTC ISO-8601 with milliseconds (`…SSS Z`) |

JCS sorts object keys. Credential refs are sorted by `id`, then `hash`, before canonicalize. Hashes are lowercase hex of `SHA-256(RFC8785(credential_document))` — the same hash SIJIL already stores as `credential_hash` and anchors on Fabric.

Golden vector: `shared/sijil-present-v1-vector.json`.

Frontend (`src/lib/ssi/presentation.ts` + `signUtf8`) and backend (`backend/src/services/ssi-presentation-protocol.ts` + `verifyEd25519Utf8`) must produce and verify **identical** UTF-8 bytes.

### What is not signed that way

Issuer credential proofs stay:

```text
Ed25519( SHA-256-bytes( RFC8785(unsigned credential document) ) )
```

with `type: DataIntegrityProof` and `cryptosuite: eddsa-jcs-2022`. Phase 3 **embeds** those proofs; it does not recompute or replace them.

### Cryptosuite naming

Learner presentation proofs use:

```text
type: DataIntegrityProof
cryptosuite: sijil-ed25519-jcs-utf8-2026
proofPurpose: authentication
```

This is **standards-adjacent** (JCS + Ed25519 + W3C VP envelope + Data Integrity `challenge` / `domain`) but **not** W3C `eddsa-jcs-2022`, which hashes the canonical JSON before signing. SIJIL learner signatures match Phase 1 bind: Ed25519 over the UTF-8 message, verified with `verifyEd25519Utf8`. Do not label holder proofs as `eddsa-jcs-2022`.

### Envelope

```json
{
  "@context": ["https://www.w3.org/ns/credentials/v2"],
  "type": ["VerifiablePresentation"],
  "holder": "<did:key:…>",
  "verifiableCredential": [
    { "…unsigned credential_document…": true, "proof": { "…existing issuer DataIntegrityProof…" : true } }
  ],
  "sijilCredentialIds": ["<credentials.id UUID>"],
  "proof": {
    "type": "DataIntegrityProof",
    "cryptosuite": "sijil-ed25519-jcs-utf8-2026",
    "created": "<issuedAt>",
    "expires": "<expiresAt>",
    "verificationMethod": "<did>#<multibase>",
    "proofPurpose": "authentication",
    "challenge": "<challengeId>",
    "nonce": "<nonce>",
    "domain": "<audience>",
    "protocol": "SIJIL-SSI-PRESENT-v1",
    "proofValue": "<canonical base64url Ed25519>"
  }
}
```

`sijilCredentialIds` is SIJIL-specific: the VC `id` is a `urn:uuid:sijil:…` URI, while APIs key credentials by database UUID. Verifiers **rebuild** claims from the envelope (recompute document hashes; ignore any client-supplied claims JSON). Substituting a different credential changes the hash → rebuilt JCS changes → signature fails.

### Verification order (protocol)

1. Malformed structure / wrong learner cryptosuite / placeholder DID → reject.
2. Rebuild claims; `holder`, `verificationMethod`, and every `credentialSubject.id` must be the same canonical `did:key`.
3. `now >= expiresAt` → expired.
4. `verifyEd25519Utf8` over UTF-8(JCS(claims)) with the public key decoded from `holderDid`.

Issuer signature + Fabric evaluate are **not** replaced by this check. Later steps must still call `evaluateCredentialVerification` for each presented credential.

### Private keys

Still browser-only, non-extractable, IndexedDB `sijil-ssi-v1`. The signed payload never includes a private key. Backend verification uses `did:key` resolution only.

## HTTP APIs (implemented locally; Postgres migration not applied)

Learner (JWT):

- `POST /api/ssi/presentations/challenge` `{ credentialIds, audience? }`
- `POST /api/ssi/presentations` `{ challengeId, did, signature }`

Public:

- `GET /api/public/vp/:id`
- `POST /api/public/vp/:id/verify`

The server rebuilds credentials from the database, verifies the holder signature, then calls existing `verifyPublicCredential` (issuer + live Fabric evaluate). Bearer HMAC shares are unchanged.

Pending live SQL: `supabase/migrations/20261017120000_ssi_presentation_challenges.sql` (do not apply until approved). Runtime uses that table when it exists (`UPDATE … WHERE used_at IS NULL`); otherwise challenges stay in Express memory. Presentation envelopes themselves remain in process memory until the presentations table is wired the same way.

## Wallet recovery

Existing non-extractable IndexedDB keys **cannot be exported**. Passphrase-wrapped vaults (optional at activation) can be backed up as AES-GCM ciphertext. Forgotten passphrases cannot be recovered and do not rotate an existing DID.
