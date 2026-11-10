/**
 * Recruiter-time re-verification of stored policy outcomes.
 * A stored MEETS/BELOW row is only reported as verified after its Groth16 proof
 * checks against the variant's pinned key, the policy threshold, and a live
 * trusted commitment (GitHub snapshot or signed, unrevoked credential).
 */
import { readGroth16Proof } from "./zkp-verify";
import { verifyGitHubContributionProof } from "./github-zkp-verify.service";
import { createSupabaseGitHubZkpStore, type GitHubZkpStore } from "./github-zkp-store";
import { loadCredentialByIdOrUri } from "./credential-verify.service";
import { readAssessmentCommitment } from "./assessment-binding";
import { verifyScorePolicyProof } from "./assessment-zkp-automation.service";
import { toPublicPolicyStatus, type ZkpPolicyVerificationRow } from "./zkp-policy-store";
import {
  ASSESSMENT_POLICY_THRESHOLD,
  ASSESSMENT_POLICY_VERSION,
  ASSESSMENT_ZKP_TYPE,
  GITHUB_EVIDENCE_MAX_AGE_MS,
  GITHUB_POLICY_THRESHOLD,
  GITHUB_POLICY_VERSION,
  GITHUB_ZKP_TYPE,
  type CircuitVariant,
  type ZkpOutcome,
} from "./zkp-policy";

export interface PolicyVerifyDependencies {
  githubStore: GitHubZkpStore;
  verifyGitHub: typeof verifyGitHubContributionProof;
  verifyScore: typeof verifyScorePolicyProof;
  loadCredential: typeof loadCredentialByIdOrUri;
  now: () => number;
}

function defaultDependencies(): PolicyVerifyDependencies {
  return {
    githubStore: createSupabaseGitHubZkpStore(),
    verifyGitHub: verifyGitHubContributionProof,
    verifyScore: verifyScorePolicyProof,
    loadCredential: loadCredentialByIdOrUri,
    now: Date.now,
  };
}

export type PolicyCheck =
  | "valid"
  | "invalid_proof"
  | "commitment_mismatch"
  | "policy_mismatch"
  | "evidence_stale"
  | "evidence_revoked"
  | "evidence_missing"
  | "not_evaluated";

export interface RecruiterPolicyView extends ReturnType<typeof toPublicPolicyStatus> {
  outcome: ZkpOutcome;
  storedOutcome: ZkpOutcome;
  check: PolicyCheck;
  message: string;
}

function notVerified(row: ZkpPolicyVerificationRow, check: PolicyCheck, message: string): RecruiterPolicyView {
  return {
    ...toPublicPolicyStatus(row),
    outcome: "NOT_VERIFIED",
    storedOutcome: row.outcome,
    check,
    message,
  };
}

function readSignals(value: unknown): [string, string] | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  if (typeof value[0] !== "string" || typeof value[1] !== "string") return null;
  return [value[0], value[1]];
}

function expectedVariant(outcome: ZkpOutcome): CircuitVariant | null {
  if (outcome === "MEETS_THRESHOLD") return "meets";
  if (outcome === "BELOW_THRESHOLD") return "below";
  return null;
}

export async function verifyPolicyRowForRecruiter(
  row: ZkpPolicyVerificationRow,
  dependencies: PolicyVerifyDependencies = defaultDependencies(),
): Promise<RecruiterPolicyView> {
  const variant = expectedVariant(row.outcome);
  if (!variant) {
    // PENDING and ERROR are reported as-is so recruiters can tell them apart from BELOW_THRESHOLD.
    return {
      ...toPublicPolicyStatus(row),
      outcome: row.outcome,
      storedOutcome: row.outcome,
      check: "not_evaluated",
      message: row.outcome === "ERROR"
        ? row.errorCode === "github_oauth_expired"
          ? "GitHub authorization expired during evaluation. No outcome is verified."
          : "Evaluation failed. No outcome is verified."
        : "Evaluation has not completed. No outcome is verified.",
    };
  }

  if (row.circuitVariant !== variant) {
    return notVerified(row, "policy_mismatch", "Stored proof variant does not match its outcome.");
  }
  const proof = readGroth16Proof(row.proof);
  const signals = readSignals(row.publicSignals);
  if (!proof || !signals) {
    return notVerified(row, "invalid_proof", "Stored proof is malformed.");
  }

  if (row.zkpType === GITHUB_ZKP_TYPE) {
    if (row.policyVersion !== GITHUB_POLICY_VERSION || row.threshold !== GITHUB_POLICY_THRESHOLD
      || signals[0] !== String(GITHUB_POLICY_THRESHOLD)) {
      return notVerified(row, "policy_mismatch", "Proof was not produced under the current GitHub policy.");
    }
    const fresh = row.evidenceFreshAt ? Date.parse(row.evidenceFreshAt) : Number.NaN;
    if (!Number.isFinite(fresh) || dependencies.now() - fresh > GITHUB_EVIDENCE_MAX_AGE_MS) {
      return notVerified(row, "evidence_stale", "GitHub evidence is older than the freshness window.");
    }
    const snapshotId = typeof row.evidenceScope.snapshotId === "string" ? row.evidenceScope.snapshotId : "";
    const snapshot = snapshotId ? await dependencies.githubStore.getSnapshot(snapshotId, row.learnerUserId) : null;
    if (!snapshot) return notVerified(row, "evidence_missing", "Trusted GitHub snapshot was not found.");
    if (snapshot.commitment !== signals[1]) {
      return notVerified(row, "commitment_mismatch", "Proof does not match the trusted snapshot commitment.");
    }
    const decision = await dependencies.verifyGitHub(
      { circuitId: GITHUB_ZKP_TYPE, proof, publicSignals: signals },
      snapshot.commitment,
      variant,
    );
    if (!decision.cryptographicallyValid) {
      return notVerified(row, "invalid_proof", "Groth16 proof did not verify.");
    }
    return {
      ...toPublicPolicyStatus(row),
      outcome: row.outcome,
      storedOutcome: row.outcome,
      check: "valid",
      message: "Groth16 proof verified against the trusted snapshot commitment. GitHub authorship was checked when the snapshot was created. This is not credential issuance or a Fabric anchor.",
    };
  }

  if (row.zkpType === ASSESSMENT_ZKP_TYPE) {
    if (row.policyVersion !== ASSESSMENT_POLICY_VERSION || row.threshold !== ASSESSMENT_POLICY_THRESHOLD
      || signals[0] !== String(ASSESSMENT_POLICY_THRESHOLD)) {
      return notVerified(row, "policy_mismatch", "Proof was not produced under the current assessment policy.");
    }
    const credentialId = typeof row.evidenceScope.credentialId === "string" ? row.evidenceScope.credentialId : "";
    const credential = credentialId ? await dependencies.loadCredential(credentialId) : null;
    if (!credential || credential.user_id !== row.learnerUserId) {
      return notVerified(row, "evidence_missing", "Signed credential was not found.");
    }
    if (credential.revoked_at) {
      return notVerified(row, "evidence_revoked", "The credential has been revoked.");
    }
    const commitment = readAssessmentCommitment(credential.credential_document);
    if (commitment.status !== "ok" || commitment.claim.commitment !== signals[1]) {
      return notVerified(row, "commitment_mismatch", "Proof does not match the signed credential commitment.");
    }
    if (!await dependencies.verifyScore(variant, signals, proof)) {
      return notVerified(row, "invalid_proof", "Groth16 proof did not verify.");
    }
    return {
      ...toPublicPolicyStatus(row),
      outcome: row.outcome,
      storedOutcome: row.outcome,
      check: "valid",
      message: "Groth16 proof verified against the signed credential commitment. This does not by itself establish a Fabric anchor.",
    };
  }

  return notVerified(row, "policy_mismatch", "Unsupported ZKP type.");
}
