# SIJIL Fabric operations

The sample test network in this repository is a development network. It is not a production Fabric network. A production deployment needs its own ordering service, peers, CAs, TLS, and an identity that is not an organization administrator.

## Current safety holds

These stay off until an operator approves them:

- `FABRIC_ENABLED=false` so the submit worker does not start chain transactions.
- `FABRIC_ANCHOR_NOT_BEFORE` unset so existing pending and failed credentials are not selected even if submits are later enabled.
- `FABRIC_REVOCATION_SUBMIT=false` so `RevokeCredential` is not sent.
- `FABRIC_RECONCILE_SUBMIT=false` so admin retry and repair do not submit a new anchor.
- `FABRIC_ALLOW_ADMIN_IDENTITY=false`. Turning `FABRIC_ENABLED` on while the certificate path still contains `Admin@org1.example.com` makes the backend refuse to start.

## Application identity

1. On an isolated network, approve enrollment: `ENROLL_APP_IDENTITY=approve ./fabric/scripts/enroll-app-identity.sh`
2. Point `FABRIC_CERT_PATH` and `FABRIC_KEY_PATH` at `users/sijil-app@org1.example.com`. Do not commit those files.
3. Rotate later by enrolling `sijil-app` again into a new MSP directory and restarting the backend. Do not reuse the Admin key.

Reads use the same gateway today. Chaincode 1.1.0 allows any channel member to evaluate and only `CN=sijil-app` or attribute `sijil.role=anchor` in `Org1MSP` to submit.

## Chaincode 1.1.0 upgrade

The running network still has the previous chaincode until this upgrade is approved and executed. Version 1.1.0 adds:

- SHA-256 hex hashes only
- UUID credential ids
- DID and timestamp checks
- writer enrollment check
- history capped at 100 entries, with a malformed value returned as an empty record rather than failing the whole query

Existing SIJIL anchors use UUID ids and SHA-256 hex hashes, so they remain readable. Anchors written with any other id or hash format would fail new submits; the unit fixtures were updated to the production format.

Upgrade on an isolated network only, after a backup of the peer volumes:

```bash
cd fabric/fabric-samples/test-network
export PATH="$PWD/../bin:$PATH"
./network.sh deployCC -c sijil -ccn credentialanchor -ccp ../../chaincode/credential-anchor -ccl typescript -ccv 1.1 -ccs 2
```

Increase `-ccs` if the current sequence is already higher. Do not run `network.sh down`.

## Activating the queue

1. Apply `supabase/migrations/20261115013000_credential_anchor_leases.sql` on an isolated database and confirm claim columns exist. Do not apply it to hosted Supabase until approved.
2. Inspect pending and failed counts with `GET /api/health/outbox` as an admin.
3. Set `FABRIC_ANCHOR_NOT_BEFORE` to the UTC time after which new credentials may be anchored. Older rows stay out of the worker.
4. Set `FABRIC_ENABLED=true` only with the `sijil-app` identity and a reachable peer.
5. Set `FABRIC_RECONCILE_SUBMIT=true` only when an administrator may retry or re-anchor one credential. A pending or failed row that the ledger already contains is updated in the database only; that path does not submit a new transaction. A hash mismatch is refused.
6. Set `FABRIC_REVOCATION_SUBMIT=true` only when pending revocations may be sent. Revocation requested before an anchor is recorded as `not_required` on the anchor and `revoked-before-anchor` in the database, with no chain transaction, once this flag is on and the ledger confirms the id is absent.

## Rollback

- Set `FABRIC_ENABLED=false` and restart the backend. The worker stops submitting. Database rows are left as they are.
- A chaincode upgrade can be rolled back only by deploying the previous package at the next sequence. Do not delete ledger keys.
- If a submit commits and the database update fails, the next eligible attempt treats the duplicate hash as success and stores the transaction id. A conflicting hash is a permanent failure and is not overwritten.

## Health

- `GET /api/health` is liveness and returns only `{ status: "ok" }`.
- `GET /api/health/ready` checks the database. Ledger connectivity is reported and does not fail readiness while Fabric is disabled.
- `GET /api/health/outbox` is admin-only and reports pending and failed anchor and revocation counts, plus whether the queue is held.

Blockchain confirmation shows that the credential hash and revocation status match the ledger. It does not prove that every underlying skill evidence item is true.
