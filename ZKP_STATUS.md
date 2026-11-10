# SIJIL ZKP status

Updated: 2026-10-31 (automated, backend-controlled policy ZKP; local only)

## Summary
Both documented ZKP types (`score-threshold-v1`, `github-contributions-v1`) now run as backend-controlled policies with fixed thresholds. Each has a companion "below" circuit, so `BELOW_THRESHOLD` is backed by a valid Groth16 proof rather than a failed one. The code is complete and tested locally. **Live use is blocked until the new policy-table migration is approved and applied.**

## Policy (enforced on the backend)
| Type | Policy version | Threshold | Evidence scope |
|------|----------------|-----------|----------------|
| `score-threshold-v1` | `assess-60-v1` | 60% | One signed SIJIL assessment credential |
| `github-contributions-v1` | `github-70-repo-v1` | 70 unique verified authored commit SHAs | One named repository (no cross-repo policy exists) |

Outcomes: `PENDING`, `MEETS_THRESHOLD`, `BELOW_THRESHOLD`, `ERROR`, `NOT_VERIFIED`.

## Circuits and artifacts (development-only setup)
- `circuits/score-threshold-v1/score_below.circom`: proves score < threshold with the same Poseidon commitment.
- `circuits/github-contributions-v1/github_contributions_below.circom`: proves count < threshold with the same Poseidon commitment.
- Artifacts: `zkp-artifacts/score-threshold-v1-below/`, `zkp-artifacts/github-contributions-v1-below/`. Hashes are pinned in `zkp-artifacts.ts` and `github-zkp-artifacts.ts`, and the backend build copies and re-verifies them.
- Single-contributor dev setup. **Not production-secure**: anyone holding the setup trapdoor could forge proofs.
- Existing "meets" circuits and keys are unchanged.

## Automation
- `zkp-automation-worker.service.ts` runs every 30 s from `server.ts`:
  - evaluates newly issued signed assessment credentials;
  - retries `PENDING` and retryable `ERROR` rows after a 10-minute backoff;
  - refreshes GitHub outcomes older than 7 days.
- GitHub: a verified outcome is reused for 24 h with no new snapshot. Recruiters see `NOT_VERIFIED` once evidence is older than 30 days.
- OAuth 401 is recorded as `ERROR` / `github_oauth_expired` and not retried until the learner reconnects. GitHub rate limits are recorded as `github_rate_limited` and retried.
- No outcome is ever written without a proof that verified under the matching key.

## API changes
- New: `GET /zkp/status`, `POST /zkp/github/evaluate { repositoryFullName }`, `POST /zkp/assessment/evaluate`, `GET /public/presentations/:token/zkp/policy`, `POST /recruiter/zkp/policy/verify`, `POST /recruiter/github-zkp/policy/verify`.
- Retired (410): `POST /zkp/github/snapshots`, `POST /zkp/github/proofs` (400 if a threshold is sent), `POST /zkp/github/disclosures`.
- Legacy disclosures and browser proofs still verify cryptographically but are labelled `policyCompliant: false` / `NOT_VERIFIED` as a policy outcome.
- Recruiter policy views re-verify the stored proof on every request. They check the variant key, the policy threshold and version, a live trusted commitment (GitHub snapshot, or signed and unrevoked credential), and freshness. They never return a score, count, blinding or witness.

## Database
- New local migration, **not applied**: `supabase/migrations/20261031140000_zkp_policy_verifications.sql` (table `zkp_policy_verifications` plus service-role-only upsert RPC, RLS deny for client roles).
- Without it, `/zkp/status` returns `available: false, reason: missing_table`, evaluate returns 503, and recruiter views return `NOT_VERIFIED`. Live check confirmed this; no snapshots were created.
- The applied `20261031010000` GitHub migration is untouched.

## Tests (this session)
- Backend `npm test`: **279/279 pass**, including real meets/below proofs at 59/60 and 69/70, cross-key rejection, reuse without re-snapshot, OAuth 401, worker backoff, and recruiter tamper, stale and revoked cases.
- Frontend `vitest run`: **126/126 pass**. Frontend and backend production builds succeed.
- `score-threshold-v1` regression suite passes.

## Known limits
- Under the existing issuance policy (unchanged), a credential is only issued for a passing attempt. In practice, assessment `BELOW_THRESHOLD` will only appear for credentials issued another way.
- Sharing a new GitHub recruiter share code invalidates the previous one.
- Groth16 validity is not GitHub authenticity (checked at snapshot time), credential issuance, or Fabric anchoring.

## Next action
Approve a single transactional live apply of `20261031140000_zkp_policy_verifications.sql` to `nhzvtqpplfruzocframc`, then re-run the live GitHub smoke test.
