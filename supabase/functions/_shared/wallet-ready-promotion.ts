/**
 * GitHub + practical → wallet_ready eligibility.
 * Keep in sync with backend/src/utils/wallet-ready-promotion.ts and
 * backend/src/utils/github-supporting-record.ts.
 */

export const WALLET_READY_PASS_PERCENT = 60;
export const WALLET_READY_STAGE = "wallet_ready";
export const IN_WALLET_STAGE = "in_wallet";
export const GITHUB_EVIDENCE_SOURCE = "GitHub";

export interface WalletReadyPromotionInput {
  callerUserId: string;
  attemptOwnerId: string;
  skillId: string | null | undefined;
  attemptStatus: string;
  scoredPassed: boolean;
  scoredPercent: number;
  hasQualifyingGitHubEvidence: boolean;
  storedPipelineStage?: string | null;
  storedAttemptPassed?: boolean;
  clientClaimedPassed?: boolean;
}

export type WalletReadyPromotionResult =
  | { promote: true }
  | { promote: false; reason: string };

export function normalizeGitHubRepoUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  const host = parsed.hostname.toLowerCase();
  if (host !== "github.com" && host !== "www.github.com") return null;

  const parts = parsed.pathname.split("/").filter(Boolean);
  if (parts.length < 2) return null;

  const owner = parts[0];
  let repo = parts[1];
  if (repo.toLowerCase().endsWith(".git")) repo = repo.slice(0, -4);
  if (!owner || !repo) return null;
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) return null;

  return `https://github.com/${owner}/${repo}`.toLowerCase();
}

export function qualifyingGitHubTitle(title: string | null | undefined): string | null {
  if (typeof title !== "string") return null;
  const trimmed = title.trim();
  return trimmed.length > 0 ? trimmed : null;
}

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
): boolean {
  void repos;
  // github_repos is learner-writable for linking; do not treat it as proof.
  // Only service-role GitHub rows in supporting_records qualify.
  return supporting.some((row) => {
    if (String(row.source ?? "").trim() !== GITHUB_EVIDENCE_SOURCE) return false;
    return Boolean(qualifyingGitHubTitle(row.title) && normalizeGitHubRepoUrl(row.url));
  });
}
