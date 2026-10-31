/**
 * Shared labels for automated ZKP policy outcomes.
 * BELOW_THRESHOLD is a proven result; NOT_VERIFIED and ERROR mean no result is proven.
 */
export function outcomeLabel(outcome: string | null | undefined): string {
  switch (outcome) {
    case "MEETS_THRESHOLD":
      return "Meets threshold";
    case "BELOW_THRESHOLD":
      return "Below threshold";
    case "ERROR":
      return "Error — not verified";
    case "PENDING":
      return "Pending";
    default:
      return "Not verified";
  }
}

export function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString() : "—";
}

export function needsGitHubReconnect(errorCode: string | null | undefined): boolean {
  return errorCode === "github_oauth_expired" || errorCode === "github_not_connected";
}
