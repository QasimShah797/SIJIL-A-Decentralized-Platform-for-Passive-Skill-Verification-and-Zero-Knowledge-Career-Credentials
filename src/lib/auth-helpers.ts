import { supabase } from "@/integrations/supabase/client";

export type AppRole = "learner" | "recruiter" | "institution" | "admin";

export const ROLE_HOME: Record<AppRole, string> = {
  learner: "/learner/profile",
  recruiter: "/recruiter/search",
  institution: "/institution/dashboard",
  admin: "/learner/profile",
};

export async function fetchUserRoles(userId: string): Promise<AppRole[]> {
  try {
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    if (error) {
      console.warn("Could not fetch user role:", error.message ?? error);
      return [];
    }

    return (data ?? []).map((r) => r.role as AppRole);
  } catch (err) {
    console.warn("Could not fetch user role:", err);
    return [];
  }
}

export function pickPrimaryRole(roles: AppRole[]): AppRole | null {
  const order: AppRole[] = ["institution", "recruiter", "learner"];
  for (const r of order) if (roles.includes(r)) return r;
  return null;
}
