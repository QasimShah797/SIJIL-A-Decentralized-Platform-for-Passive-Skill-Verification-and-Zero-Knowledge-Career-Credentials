/**
 * Backend-enforced ZKP policy constants.
 * Clients cannot choose or override these thresholds.
 */
export const ASSESSMENT_ZKP_TYPE = "score-threshold-v1" as const;
export const GITHUB_ZKP_TYPE = "github-contributions-v1" as const;
export const MOODLE_ZKP_TYPE = "moodle-completion-v1" as const;
export const PEER_REVIEW_ZKP_TYPE = "peer-review-count-v1" as const;

export const ASSESSMENT_POLICY_VERSION = "assess-60-v1" as const;
export const GITHUB_POLICY_VERSION = "github-70-repo-v1" as const;
export const SHARE_GITHUB_POLICY_VERSION = "share-github-50-repo-v1" as const;
export const SHARE_GITHUB_THRESHOLD = 50;
/** Share-flow private result: score ≥ 50% (does not affect credential issuance). */
export const SHARE_ASSESSMENT_POLICY_VERSION = "share-assess-50-v1" as const;
export const SHARE_MOODLE_POLICY_VERSION = "share-moodle-50-v1" as const;
/**
 * Share-flow peer policy: at least one eligible peer review.
 * Derived from existing SIJIL copy ("at least one review"); change only via versioned policy.
 */
export const SHARE_PEER_POLICY_VERSION = "share-peer-1-v1" as const;

/** Fixed assessment pass bar (percent) for recruiter automation. */
export const ASSESSMENT_POLICY_THRESHOLD = 60;

/** Share-with-recruiter / public-link private practical claim (percent). */
export const SHARE_ASSESSMENT_THRESHOLD = 50;

/** Fixed GitHub unique verified authored commit SHA threshold (per repository). */
export const GITHUB_POLICY_THRESHOLD = 70;

/** Share Moodle claim: completed*100 >= required*thresholdPercent. */
export const SHARE_MOODLE_THRESHOLD_PERCENT = 50;

/** Eligible peer reviews required for share private claim. */
export const SHARE_PEER_REVIEW_THRESHOLD = 1;

/** A verified GitHub outcome is reused without re-fetching GitHub inside this window. */
export const GITHUB_REUSE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Recruiters see NOT_VERIFIED once GitHub evidence is older than this. */
export const GITHUB_EVIDENCE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** The worker refreshes verified GitHub outcomes older than this. */
export const GITHUB_REFRESH_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/** Minimum gap between automatic retries of an ERROR row. */
export const RETRY_BACKOFF_MS = 10 * 60 * 1000;

export type ZkpOutcome =
  | "PENDING"
  | "MEETS_THRESHOLD"
  | "BELOW_THRESHOLD"
  | "ERROR"
  | "NOT_VERIFIED";

export type CircuitVariant = "meets" | "below";

export function outcomeFromComparison(privateValue: number, threshold: number): "MEETS_THRESHOLD" | "BELOW_THRESHOLD" {
  return privateValue >= threshold ? "MEETS_THRESHOLD" : "BELOW_THRESHOLD";
}

export function variantForOutcome(outcome: "MEETS_THRESHOLD" | "BELOW_THRESHOLD"): CircuitVariant {
  return outcome === "MEETS_THRESHOLD" ? "meets" : "below";
}

export const ASSESSMENT_POLICY_CLAIM =
  "Private assessment score is compared to the SIJIL 60% policy threshold without revealing the exact score.";

export const GITHUB_POLICY_CLAIM =
  "Private count of unique verified authored commit SHAs in one named repository is compared to the SIJIL policy threshold of 70.";
