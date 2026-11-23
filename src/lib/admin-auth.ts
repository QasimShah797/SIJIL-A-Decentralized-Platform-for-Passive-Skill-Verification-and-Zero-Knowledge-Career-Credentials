import { fetchUserRoles } from "@/lib/auth-helpers";

export type AdminAccessResult =
  | { ok: true }
  | { ok: false; reason: "wrong_role" };

/** Admin portal access — does not require learner or recruiter roles. */
export async function verifyAdminAccess(userId: string): Promise<AdminAccessResult> {
  const roles = await fetchUserRoles(userId);
  if (!roles.includes("admin")) {
    return { ok: false, reason: "wrong_role" };
  }
  return { ok: true };
}
