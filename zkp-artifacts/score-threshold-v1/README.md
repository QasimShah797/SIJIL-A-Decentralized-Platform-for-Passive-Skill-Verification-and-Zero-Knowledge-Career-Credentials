# score-threshold-v1 public artifact bundle

This directory is the single public bundle used by the frontend and the backend.

It contains only:

- `score_threshold.wasm`
- `score_threshold_final.zkey`
- `verification_key.json`
- `hashes.json`

Powers of tau files, contribution proving keys, private witnesses, and toxic-waste output are not part of this bundle. They stay in the gitignored circuit build directory.

## Development-only trusted setup

The proving key in this bundle comes from `circuits/score-threshold-v1/scripts/setup-dev.mjs`. That script uses random local entropy for a development Groth16 setup. It is not a multi-party production ceremony. Replace this bundle before production issuance of proofs that must resist a compromised setup contributor.

## Reproduce the bundle

From the repository root, after the circuit build exists:

```bash
node scripts/publish-zkp-bundle.mjs
```

The script copies the four public files and checks each SHA-256 digest against `hashes.json`. It does not run a new trusted setup.

The backend build copies this same directory to `backend/zkp-artifacts/score-threshold-v1` and checks the hashes again. Set `SIJIL_ZKP_ARTIFACT_DIR` when the process should use another copy of this same bundle.
