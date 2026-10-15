/**
 * Server-side eligibility for GitHub + practical → wallet_ready.
 * Ignores learner-supplied passed flags. Scoring must already have happened
 * from the stored answer key.
 */

export const WALLET_READY_PASS_PERCENT = 60;
export const WALLET_READY_STAGE = "wallet_ready";
export const IN_WALLET_STAGE = "in_wallet";

export interface WalletReadyPromotionInput {
  callerUserId: string;
  attemptOwnerId: string;
  skillId: string | null | undefined;
  /** Attempt status before this evaluate completes. */
  attemptStatus: string;
  scoredPassed: boolean;
  scoredPercent: number;
  hasQualifyingGitHubEvidence: boolean;
  storedPipelineStage?: string | null;
  /** Ignored on purpose — learners can write this column under RLS. */
  storedAttemptPassed?: boolean;
  /** Ignored on purpose — never trust the request body. */
  clientClaimedPassed?: boolean;
}

export type WalletReadyPromotionResult =
  | { promote: true }
  | { promote: false; reason: string };

export function evaluateWalletReadyPromotion(
  input: WalletReadyPromotionInput,
): WalletReadyPromotionResult {
  void input.storedAttemptPassed;
  void input.clientClaimedPassed;

  if (!input.callerUserId || input.callerUserId !== input.attemptOwnerId) {
    return { promote: false, reason: "attempt_owner_mismatch" };
  }
  if (!input.skillId) {
    return { promote: false, reason: "missing_skill" };
  }
  if (input.attemptStatus !== "in_progress") {
    return { promote: false, reason: "attempt_not_in_progress" };
  }
  if (input.storedPipelineStage === IN_WALLET_STAGE) {
    return { promote: false, reason: "already_in_wallet" };
  }
  if (!input.scoredPassed || input.scoredPercent < WALLET_READY_PASS_PERCENT) {
    return { promote: false, reason: "assessment_not_passed" };
  }
  if (!input.hasQualifyingGitHubEvidence) {
    return { promote: false, reason: "missing_github_evidence" };
  }
  return { promote: true };
}

export function hasQualifyingGitHubEvidenceRows(
  repos: Array<{ title?: string | null; url?: string | null }>,
  supporting: Array<{ source?: string | null; title?: string | null; url?: string | null }>,
  normalizeUrl: (url: string | null | undefined) => string | null,
  qualifyingTitle: (title: string | null | undefined) => string | null,
): boolean {
  void repos;
  // github_repos is learner-writable for linking; do not treat it as proof.
  // Only service-role GitHub rows in supporting_records qualify.
  return supporting.some((row) => {
    if (String(row.source ?? "").trim() !== "GitHub") return false;
    return Boolean(qualifyingTitle(row.title) && normalizeUrl(row.url));
  });
}
