# SIJIL SSI Phase 1 — Learner-controlled cryptographic identity

Phase 1 adds a real Ed25519 **did:key** wallet on the learner’s device. It does **not** re-issue historical credentials, replace issuer signatures, or bind old VCs to the new DID.

## Implemented

- **Activate SSI Identity** in the learner wallet.
- Browser **Ed25519** key generation via Web Crypto (`extractable: false`).
- **did:key** encoding/resolution (multicodec `ed25519-pub` `0xed01`, multibase base58btc).
- Non-extractable private keys persisted in **IndexedDB** (`sijil-ssi-v1`), keyed by authenticated `userId`.
- Challenge–response ownership proof (`POST /api/ssi/challenge`, `POST /api/ssi/bind`).
- Public DID resolution (`GET /api/ssi/resolve?did=`).
- Wallet UI: Not activated / Active / Key unavailable, DID, fingerprint, copy DID.
- Existing issuer-signed credentials and Fabric verify paths are unchanged.

## Security architecture

1. Learner keys are generated **only in the browser**. Express and Supabase never see the private key.
2. Issuer keys (`ISSUER_ED25519_*`) remain server-side and are used only for credential assertion proofs.
3. Associating a DID with an account requires:
   - a valid learner JWT
   - a fresh, single-use, 5-minute challenge bound to `userId`, `audience=sijil-express`, `purpose=bind-learner-did`
   - an Ed25519 signature over `challenge.payload + "\ndid=" + did`
   - `did:key` resolution of the public key that verifies that signature
4. A DID string alone is rejected.
5. Bindings are stored in `learner_ssi_identities` (service-role **INSERT** only). The server derives `did`, `public_key_multibase`, and `fingerprint` from the same decoded Ed25519 public key. Extra client metadata is rejected. DID / fingerprint / multibase / `user_id` cannot be updated. Authenticated clients may SELECT their own row; INSERT/UPDATE/DELETE are revoked. This is **not** `credentials.holder_did`.

## Key storage

| Location | What is stored |
| --- | --- |
| IndexedDB | Non-extractable `CryptoKey` + public DID/fingerprint metadata |
| `localStorage` / `sessionStorage` | Nothing (refused) |
| Supabase | DID, fingerprint, multibase public key **after** proof — never the private key |

If the browser cannot persist a non-extractable Ed25519 key in IndexedDB, activation is **disabled**. SIJIL will not fall back to plaintext key storage.

If a previous DID exists on the server but this device has no usable key, status is **Key unavailable**. A new DID is **not** generated.

## DID format

```
did:key:z<base58btc(0xed 0x01 || 32-byte Ed25519 public key)>
verificationMethod = did + "#" + publicKeyMultibase
```

Legacy profile values `did:key:z6Mk` + UUID hex are **placeholders**. They are not cryptographic did:key identifiers. `isLegacyPlaceholderDid()` detects them.

## Browser compatibility

Requires Web Crypto Ed25519 **and** IndexedDB structured-clone of non-extractable `CryptoKey`:

- Current Chromium and Firefox: expected to work.
- Safari: probe at runtime; if persistence fails, activation stays disabled.
- Private/strict modes that block IndexedDB: unsupported.

## Known limitations

- **No cross-device recovery** and no seed phrase. Losing the browser profile loses the key.
- XSS can still call `crypto.subtle.sign` in the page origin; non-extractable keys reduce exfiltration, they do not stop in-page malware.
- Account switching is isolated by `userId` in IndexedDB; it is not a multi-device wallet.
- Key rotation is not implemented.
- Old credentials remain bound to placeholder `holder_did` / issuer Ed25519 proofs. Recruiter “blockchain verified” still means issuer signature + Fabric, **not** learner DID control.
- Server registration needs migration `20261016120000_learner_ssi_identities.sql` (not applied by the agent). Without it, the key can still be created locally; bind returns 503.

## Manual testing

1. `cd backend && FABRIC_ENABLED=false npm run dev`
2. `npm run dev` (frontend :8080)
3. Sign in as a learner → Wallet.
4. Confirm SSI Identity is **Not activated**.
5. Click **Activate SSI Identity**.
6. Confirm status **Active**, DID starts with `did:key:z`, fingerprint shown, copy works.
7. DevTools: Application → IndexedDB `sijil-ssi-v1` contains a `CryptoKey`, no PEM/JWK private key in Network tab (`/api/ssi/bind` body is `challengeId`, `did`, `signature` only).
8. Refresh: DID stays the same (no silent regeneration).
9. Existing credential verify / recruiter share still uses issuer + ledger, not this DID.

## Next phase (Phase 2)

See `SSI_PHASE2.md`. New issuance binds `credentialSubject.id` / `holder_did` to the proven SSI DID. Historical documents are not rewritten. Learner-signed verifiable presentations remain a later phase.
