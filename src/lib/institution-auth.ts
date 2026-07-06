import { fetchUserRoles } from "@/lib/auth-helpers";
import { fetchInstitutionProfile } from "@/lib/db/institution-profile";

export const INSTITUTION_ACTIVE_STATUS = "active" as const;

export type InstitutionAccessResult =
  | { ok: true }
  | { ok: false; reason: "wrong_role" | "no_profile" | "inactive"; status?: string };

/** Institution login and route guard: role institution + profile status active. */
export async function verifyInstitutionAccess(userId: string): Promise<InstitutionAccessResult> {
  const roles = await fetchUserRoles(userId);
  if (!roles.includes("institution")) {
    return { ok: false, reason: "wrong_role" };
  }

  const profile = await fetchInstitutionProfile(userId);
  if (!profile) {
    return { ok: false, reason: "no_profile" };
  }
  if (profile.status !== INSTITUTION_ACTIVE_STATUS) {
    return { ok: false, reason: "inactive", status: profile.status };
  }

  return { ok: true };
}
