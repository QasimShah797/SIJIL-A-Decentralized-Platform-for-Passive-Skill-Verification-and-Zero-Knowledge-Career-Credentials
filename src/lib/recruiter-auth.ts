import { fetchUserRoles } from "@/lib/auth-helpers";
import { supabase } from "@/integrations/supabase/client";

export type RecruiterAccessResult =
  | { ok: true }
  | { ok: false; reason: "wrong_role" | "no_profile" };

export async function fetchRecruiterProfile(userId: string) {
  const { data, error } = await supabase
    .from("recruiter_profiles")
    .select("user_id, full_name, work_email, company_name, verification_status")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.warn("Could not fetch recruiter profile:", error.message ?? error);
    return null;
  }

  return data;
}

/** Recruiter login and route guard checks. */
export async function verifyRecruiterAccess(userId: string): Promise<RecruiterAccessResult> {
  const roles = await fetchUserRoles(userId);
  if (!roles.includes("recruiter")) {
    return { ok: false, reason: "wrong_role" };
  }

  const profile = await fetchRecruiterProfile(userId);
  if (!profile) {
    return { ok: false, reason: "no_profile" };
  }

  return { ok: true };
}
