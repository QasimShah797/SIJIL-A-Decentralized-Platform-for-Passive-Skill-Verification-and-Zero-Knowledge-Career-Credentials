/**
 * A private share link is not publication to the recruiter directory.
 * Existing links stay valid. A row appears in search only when the learner
 * payload sets audience to recruiter-directory. Nothing in the current
 * share flow sets that value, so current links stay unlisted.
 */
import { isActiveShareRow } from "./learner-access";

export const RECRUITER_DIRECTORY_AUDIENCE = "recruiter-directory";

export function shareListedForRecruiters(row: {
  revokedAt?: string | null;
  expiresAt?: string | null;
  disclosedPayload?: unknown;
  now?: Date;
}): boolean {
  if (!isActiveShareRow({
    revokedAt: row.revokedAt,
    expiresAt: row.expiresAt,
    now: row.now,
  })) {
    return false;
  }
  if (!row.disclosedPayload || typeof row.disclosedPayload !== "object" || Array.isArray(row.disclosedPayload)) {
    return false;
  }
  return (row.disclosedPayload as Record<string, unknown>).audience === RECRUITER_DIRECTORY_AUDIENCE;
}
