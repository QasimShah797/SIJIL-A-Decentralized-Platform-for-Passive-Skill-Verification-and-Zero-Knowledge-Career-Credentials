/**
 * Backend-enforced ZKP policy constants.
 * Clients cannot choose or override these thresholds.
 */
export const ASSESSMENT_ZKP_TYPE = "score-threshold-v1" as const;
export const GITHUB_ZKP_TYPE = "github-contributions-v1" as const;

export const ASSESSMENT_POLICY_VERSION = "assess-60-v1" as const;
export const GITHUB_POLICY_VERSION = "github-70-repo-v1" as const;

/** Fixed assessment pass bar (percent). */
export const ASSESSMENT_POLICY_THRESHOLD = 60;

/** Fixed GitHub unique verified authored commit SHA threshold (per repository). */
export const GITHUB_POLICY_THRESHOLD = 70;

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
