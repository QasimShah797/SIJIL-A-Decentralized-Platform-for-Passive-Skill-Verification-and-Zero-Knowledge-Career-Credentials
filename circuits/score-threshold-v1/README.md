# score-threshold-v1

Development-only Circom 2 / Groth16 demonstration for SIJIL.

A prover shows that a private integer score is between 0 and 100 and is at least a public threshold, and that the public Poseidon commitment opens to that score. The score and the blinding factor are not public outputs.

A valid proof from this directory is only a mathematical Groth16 proof. It does not authenticate the learner or the attempt against SIJIL, and it does not establish issuer authenticity, revocation status, or a Fabric anchor. `learnerId` and `attemptId` are committed private values. Checking them against a signed credential is later work.

## Pinned toolchain

| Tool | Version |
|---|---|
| Circom | 2.1.9 linux-amd64, SHA-256 `e5575829252d763b7818049df9de2ef9304df834697de77fa63ce7babc23c967` |
| snarkjs | 0.7.5 |
| circomlib | 2.0.5 |
| circomlibjs | 0.1.7 |
| Curve | BN254, called `bn128` by snarkjs |
| Powers of tau | 2^12, one local contribution |

The circuit source SHA-256 for this file is `6cb567565e6144fb8d157009c0afe7afe8a7d1f78bfc1ab682dbb77d7b386b0d`. The verification-key hash is not stable. The setup script prints it and writes it to `build/hashes.json`.

## Field encoding

The BN254 scalar field is

```text
21888242871839275222246405745257275088548364400416034343698204186575808495617
```

| Value | Encoding |
|---|---|
| Domain | Big-endian integer of the UTF-8 bytes of `SIJIL-ASSESS-v1`. That is 15 bytes and the field element `432447140727981111453175978658723377`. |
| UUID | Remove hyphens and parse the 32 hex characters as a big-endian integer. A UUID is 128 bits, so it fits in one field element with no reduction. |
| Blinding | 31 bytes from `crypto.randomBytes`, big-endian. `2^248` is below the field prime, so this is uniform and is not reduced. |
| Score and threshold | Integers encoded as canonical decimal field elements. |

The commitment is circomlib `Poseidon(5)` over

```text
[domain, score, blinding, learnerId, attemptId]
```

`src/commitment.mjs` uses `circomlibjs` `buildPoseidon()` with that same input order. The tests require the Groth16 public commitment to equal this helper.

`createAssessmentCommitment` is the issuer-side helper. It returns `publicCommitment`, which contains only the canonical decimal commitment, and `opening`, which contains the score and blinding. Only `publicCommitment` may later be copied into a credential. `verifyAssessmentOpening` recomputes Poseidon and returns false when the opening does not match. Neither function logs the score or the blinding factor.

## Public signals

The only public signals, in this order, are:

1. `threshold`
2. `commitment`

There is no public output. Range checks use circomlib `Num2Bits` and `LessEqThan`. The library assigns bits with a hint, then constrains each bit to `0` or `1` and constrains their weighted sum to the input.

## Run the demonstration

From this directory, with Node.js 20 or newer:

```bash
npm install
npm test
```

`npm test` compiles the circuit, builds a development Groth16 setup if `build/` is missing, then generates and verifies real proofs. The first run downloads Circom and spends several minutes on the powers of tau. Later runs reuse `build/` unless you pass:

```bash
node scripts/setup-dev.mjs --force
```

Rejected witnesses print `ERROR: 4` from the witness calculator before the test marks them rejected. That line is the constraint failure, not a failed test.

Expected results:

| Case | Result |
|---|---|
| Score 73, threshold 60 | Proof verifies |
| Score 100, threshold 100 | Proof verifies |
| Score 0, threshold 0 | Proof verifies |
| Score 59, threshold 60 | Prover rejects the witness |
| Score 101 | Prover rejects the witness |
| Threshold 101 | Prover rejects the witness |
| Commitment that does not open to the witness | Prover rejects the witness |
| Proof with the public threshold changed | Verifier returns false |
| Proof with the public commitment changed | Verifier returns false |
| Proof with `pi_a` changed | Verifier rejects it |
| Proof checked against a second development verification key | Verifier rejects it |

## Setup assumptions

This is a single-contributor Groth16 setup. The script deletes the pre-contribution zkey and does not write the contribution entropy. That is still not a production ceremony: a setup run on a compromised machine could retain the trapdoor, and anyone with that trapdoor can forge proofs for this verification key. Use the generated key only for this demonstration.
