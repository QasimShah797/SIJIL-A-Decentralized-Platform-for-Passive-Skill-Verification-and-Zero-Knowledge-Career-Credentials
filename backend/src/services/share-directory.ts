/**
 * A private share link is not publication to the recruiter directory.
 * Existing links stay valid. A row appears in search only when the learner
 * payload sets audience to recruiter-directory. A public verification link
 * does not set that value, so it stays unlisted. A direct share is listed
 * only for the recipientUserId stored on the same payload.
 */
import { isActiveShareRow } from "./learner-access";

export const RECRUITER_DIRECTORY_AUDIENCE = "recruiter-directory";
export const DIRECT_RECRUITER_SHARE = "direct-recruiter";
export const ALL_RECRUITERS_SHARE = "all-recruiters";

const RECIPIENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function directRecipientId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const row = payload as Record<string, unknown>;
  if (row.shareKind !== DIRECT_RECRUITER_SHARE) return null;
  return typeof row.recipientUserId === "string" && RECIPIENT_ID.test(row.recipientUserId)
    ? row.recipientUserId
    : null;
}

export function isAllRecruiterShare(payload: unknown): boolean {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  return (payload as Record<string, unknown>).shareKind === ALL_RECRUITERS_SHARE;
}

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

/**
 * A direct share is visible only to its recipient. An all-recruiters share is
 * visible to every recruiter. A public link is not. An explicit directory
 * publication remains visible to every recruiter.
 */
export function shareVisibleToRecruiter(row: {
  revokedAt?: string | null;
  expiresAt?: string | null;
  disclosedPayload?: unknown;
  now?: Date;
  recruiterUserId: string;
}): boolean {
  if (!isActiveShareRow(row)) return false;
  const recipient = directRecipientId(row.disclosedPayload);
  if (recipient) return recipient === row.recruiterUserId;
  if (isAllRecruiterShare(row.disclosedPayload)) return true;
  return shareListedForRecruiters(row);
}
