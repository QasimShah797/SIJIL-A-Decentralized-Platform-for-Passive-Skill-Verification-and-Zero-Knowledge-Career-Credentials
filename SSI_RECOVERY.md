# SIJIL learning-identity recovery

This note covers the learner key the browser already creates. It does not rotate keys or change the recovery file format.

## What the learner must keep

- The downloaded file `sijil-learning-identity-recovery.json`.
- The recovery password chosen during setup. SIJIL does not store that password and cannot reset it.
- A second copy of the file outside the browser. Clearing site data deletes a browser-only key.

The file is encrypted with PBKDF2-SHA-256, 310,000 iterations, and AES-GCM. A wrong password and a damaged file produce the same failure. A short password can be guessed offline from a stolen file.

A key created with the browser-only option cannot be exported or restored on another browser. Restoring it requires creating a new learning identity, which this recovery path does not do.

## Restore

1. Sign in to the same SIJIL account on the new browser.
2. Open Privacy & Security and choose Restore My Learning Identity.
3. Select the recovery file and enter the same password.
4. SIJIL checks the signature against the DID already stored for that account. A mismatch does not replace the account DID.

After a successful restore, the same key can sign a verifiable presentation. The credential documents already issued stay valid.

## If the file or password is lost

The existing DID stays on the account. Do not issue a replacement DID over the old credentials. The learner can still view credentials SIJIL holds, but cannot prove control of the old key or sign a new presentation from a new browser.

## Operator disaster recovery

Back up, outside the application database:

- The issuer Ed25519 private key and the presentation signing secret.
- The Supabase project, including `learner_ssi_identities`, `ssi_bind_challenges`, `ssi_presentation_challenges`, and `ssi_verifiable_presentations`.

Restoring a database backup does not recreate a learner's private key. That key exists only in the browser or the learner's recovery file.

Production must have `ssi_bind_challenges` applied. Without it, identity activation fails closed instead of storing the challenge in process memory.

Do not log recovery passwords, private keys, service-role keys, or the presentation signing secret.
