/**
 * Pure helpers for GitHub activity_title construction.
 * No Deno/runtime imports — safe for Edge sync and Node regression tests.
 */

const EMPTY_PLACEHOLDERS = new Set(["", "undefined", "null"]);

/** Normalize a GitHub PR/issue subject title; never returns undefined/null literals. */
export function normalizeGithubSubjectTitle(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed || EMPTY_PLACEHOLDERS.has(trimmed.toLowerCase())) return fallback;
  return trimmed;
}

function normalizeActionLabel(action: unknown, fallback = "updated"): string {
  if (typeof action !== "string") return fallback;
  const trimmed = action.trim();
  if (!trimmed || EMPTY_PLACEHOLDERS.has(trimmed.toLowerCase())) return fallback;
  return trimmed;
}

function normalizeIssueNumber(number: unknown): string {
  if (typeof number === "number" && Number.isFinite(number)) return String(number);
  if (typeof number === "string" && number.trim() !== "") {
    const n = Number(number);
    if (Number.isFinite(n)) return String(n);
  }
  return "?";
}

function normalizeStateLabel(state: unknown): string | null {
  if (typeof state !== "string") return null;
  const trimmed = state.trim();
  if (!trimmed || EMPTY_PLACEHOLDERS.has(trimmed.toLowerCase())) return null;
  return trimmed;
}

/** PullRequestEvent: `PR #<n> <action>: <title>` */
export function formatPullRequestEventActivityTitle(
  number: unknown,
  action: unknown,
  title: unknown,
): string {
  const subject = normalizeGithubSubjectTitle(title, "Untitled pull request");
  return `PR #${normalizeIssueNumber(number)} ${normalizeActionLabel(action)}: ${subject}`;
}

/** IssuesEvent: `Issue #<n> <action>: <title>` */
export function formatIssueEventActivityTitle(
  number: unknown,
  action: unknown,
  title: unknown,
): string {
  const subject = normalizeGithubSubjectTitle(title, "Untitled issue");
  return `Issue #${normalizeIssueNumber(number)} ${normalizeActionLabel(action)}: ${subject}`;
}

/** PR search items: `PR #<n>: <title> (<state>)` */
export function formatPullRequestSearchActivityTitle(
  number: unknown,
  title: unknown,
  state: unknown,
): string {
  const subject = normalizeGithubSubjectTitle(title, "Untitled pull request");
  const stateLabel = normalizeStateLabel(state);
  if (stateLabel) return `PR #${normalizeIssueNumber(number)}: ${subject} (${stateLabel})`;
  return `PR #${normalizeIssueNumber(number)}: ${subject}`;
}
