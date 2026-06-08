import { supabase } from "@/integrations/supabase/client";
import { isLearnerProfileComplete } from "@/lib/db/learner-profile";

export type AppRole = "learner" | "recruiter" | "institution" | "admin";

export const ROLE_HOME: Record<AppRole, string> = {
  learner: "/learner/profile",
  recruiter: "/recruiter/search",
  institution: "/institution/dashboard",
  admin: "/learner/profile",
};

export async function fetchUserRoles(userId: string): Promise<AppRole[]> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error || !data) return [];
  return data.map((r) => r.role as AppRole);
}

export function pickPrimaryRole(roles: AppRole[]): AppRole | null {
  const order: AppRole[] = ["institution", "recruiter", "learner"];
  for (const r of order) if (roles.includes(r)) return r;
  return null;
}

export async function resolvePostAuthRedirect(userId: string, roles: AppRole[]): Promise<string> {
  const role = pickPrimaryRole(roles);
  if (!role) return "/signup";
  return resolvePostAuthRedirectForRole(userId, role);
}

export async function resolvePostAuthRedirectForRole(userId: string, role: AppRole): Promise<string> {
  if (role === "learner") {
    const done = await isLearnerProfileComplete(userId);
    return done ? ROLE_HOME.learner : "/learner/complete-profile";
  }
  return ROLE_HOME[role];
}
