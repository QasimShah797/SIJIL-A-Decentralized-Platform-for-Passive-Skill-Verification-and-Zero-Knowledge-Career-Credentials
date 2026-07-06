import { fetchUserRoles } from "@/lib/auth-helpers";
import { fetchLearnerProfileRow, isLearnerProfileComplete } from "@/lib/db/learner-profile";

export type LearnerAccessResult =
  | { ok: true; profileComplete: boolean }
  | { ok: false; reason: "wrong_role" | "no_profile" | "not_activated" };

export async function isLearnerAccountActivated(userId: string): Promise<boolean> {
  const row = await fetchLearnerProfileRow(userId);
  if (!row) return false;
  if (!row.institution_id) return true;
  return Boolean(row.account_activated_at);
}

/** Learner login and route guard checks. */
export async function verifyLearnerAccess(userId: string): Promise<LearnerAccessResult> {
  const roles = await fetchUserRoles(userId);
  if (!roles.includes("learner")) {
    return { ok: false, reason: "wrong_role" };
  }

  const row = await fetchLearnerProfileRow(userId);
  if (!row) {
    return { ok: false, reason: "no_profile" };
  }

  if (row.institution_id && !row.account_activated_at) {
    return { ok: false, reason: "not_activated" };
  }

  const profileComplete = await isLearnerProfileComplete(userId);
  return { ok: true, profileComplete };
}
