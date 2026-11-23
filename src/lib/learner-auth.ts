import { fetchUserRoles } from "@/lib/auth-helpers";
import { fetchLearnerProfileRow } from "@/lib/db/learner-profile";

export type LearnerAccessResult =
  | { ok: true; profileComplete: boolean }
  | { ok: false; reason: "wrong_role" | "no_profile" };

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

  return { ok: true, profileComplete: row.profile_completed === true };
}
