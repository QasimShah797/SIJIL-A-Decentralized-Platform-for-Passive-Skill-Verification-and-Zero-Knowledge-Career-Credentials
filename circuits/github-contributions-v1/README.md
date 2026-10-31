# github-contributions-v1

Development-only Circom 2 / Groth16 proof that a private count of unique verified repository commit SHAs is at least a public threshold.

This is not GitHub's contribution graph. The circuit does not talk to GitHub. The backend must check the connected GitHub user id, commit authorship, and the trusted snapshot before a proof is treated as evidence.

## Public and private inputs

Public signals, in order:

1. `threshold`
2. `commitment`

Private inputs:

- `count`
- `blinding`
- `learnerId`
- `snapshotId`

The commitment is Poseidon(5) over:

`domain("SIJIL-GITHUB-v1"), count, blinding, learnerId, snapshotId`

`src/commitment.mjs` uses the same input order. Both learner and snapshot identifiers are UUIDs interpreted as integers.

## Trusted setup

`github_contributions_final.zkey` and `verification_key.json` in this directory come from a single-contributor development setup. They are not a multi-party production ceremony. A leaked setup trapdoor could forge proofs for this verification key. Do not describe verification with this key as production-secure.

The backend pins SHA-256 hashes in `backend/src/services/github-zkp-artifacts.ts`. `hashes.json` records those same hashes.

## What a valid proof does not establish

- GitHub authenticity
- Credential issuance
- A Hyperledger Fabric anchor

Those checks stay outside the circuit. The recruiter verification response reports them separately.
