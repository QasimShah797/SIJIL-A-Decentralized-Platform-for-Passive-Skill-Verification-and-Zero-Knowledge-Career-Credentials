import { supabase } from "@/integrations/supabase/client";
import { avatarInitials, holderDidFromUserId } from "@/lib/did";

export type LearnerProfileView = {
  userId: string;
  name: string;
  did: string;
  email: string;
  studentId: string;
  program: string;
  batch: string;
  institution: string;
  avatar: string;
};

export async function fetchLearnerProfile(userId: string, email?: string | null): Promise<LearnerProfileView> {
  const { data } = await supabase
    .from("learner_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  const first = data?.first_name ?? "";
  const last = data?.last_name ?? "";
  const name = [first, last].filter(Boolean).join(" ") || email?.split("@")[0] || "Learner";

  return {
    userId,
    name,
    did: data?.holder_did ?? holderDidFromUserId(userId),
    email: email ?? "",
    studentId: data?.student_id ?? "—",
    program: data?.program ?? "—",
    batch: data?.batch ?? "—",
    institution: data?.institution_name ?? "—",
    avatar: avatarInitials(first, last, name.slice(0, 2).toUpperCase()),
  };
}

export async function fetchAllLearnerProfiles(): Promise<(LearnerProfileView & { user_id: string })[]> {
  const { data, error } = await supabase.from("learner_profiles").select("*");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    userId: row.user_id,
    user_id: row.user_id,
    name: [row.first_name, row.last_name].filter(Boolean).join(" "),
    did: row.holder_did ?? holderDidFromUserId(row.user_id),
    email: "",
    studentId: row.student_id ?? "—",
    program: row.program ?? "—",
    batch: row.batch ?? "—",
    institution: row.institution_name ?? "—",
    avatar: avatarInitials(row.first_name, row.last_name),
  }));
}
