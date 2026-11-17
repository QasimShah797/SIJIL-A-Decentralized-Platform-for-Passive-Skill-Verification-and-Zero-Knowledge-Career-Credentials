/**
 * Application decision for a recruiter GitHub activity request.
 * A count below the threshold is "unsatisfied". It is not a Groth16 proof.
 * Incomplete collection must throw before this function is called.
 */
export const GITHUB_ACTIVITY_THRESHOLDS = [50, 100, 150] as const;
export type GitHubActivityThreshold = (typeof GITHUB_ACTIVITY_THRESHOLDS)[number];

export function isGitHubActivityThreshold(value: number): value is GitHubActivityThreshold {
  return GITHUB_ACTIVITY_THRESHOLDS.includes(value as GitHubActivityThreshold);
}

export function githubActivityDecision(count: number, threshold: GitHubActivityThreshold): "verified" | "unsatisfied" {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error("GitHub commit collection is incomplete");
  }
  return count >= threshold ? "verified" : "unsatisfied";
}
