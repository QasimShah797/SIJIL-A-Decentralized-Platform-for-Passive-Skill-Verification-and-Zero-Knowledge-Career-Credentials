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
    .select("user_id, first_name, last_name, institution_name, program, student_id, holder_did")
    .eq("user_id", userId)
    .maybeSingle();

  // batch is optional in DB — fetch separately so missing column doesn't break reads
  let batch = "—";
  const { data: batchRow } = await supabase
    .from("learner_profiles")
    .select("batch")
    .eq("user_id", userId)
    .maybeSingle();
  if (batchRow && "batch" in batchRow && batchRow.batch) batch = batchRow.batch;

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
    batch,
    institution: data?.institution_name ?? "—",
    avatar: avatarInitials(first, last, name.slice(0, 2).toUpperCase()),
  };
}

function hasRequiredLearnerFields(row: {
  first_name?: string | null;
  last_name?: string | null;
  institution_name?: string | null;
  program?: string | null;
  student_id?: string | null;
} | null): boolean {
  if (!row) return false;
  return (
    !!row.first_name?.trim() &&
    !!row.last_name?.trim() &&
    !!row.institution_name?.trim() &&
    !!row.program?.trim() &&
    !!row.student_id?.trim()
  );
}

export async function isLearnerProfileComplete(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("learner_profiles")
    .select("profile_completed, first_name, last_name, institution_name, program, student_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    // profile_completed column may not exist yet — infer from required fields
    const { data: fallback } = await supabase
      .from("learner_profiles")
      .select("first_name, last_name, institution_name, program, student_id")
      .eq("user_id", userId)
      .maybeSingle();
    return hasRequiredLearnerFields(fallback);
  }

  if (data?.profile_completed === true) return true;
  return hasRequiredLearnerFields(data);
}

export async function isUsernameAvailable(username: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("learner_profiles")
    .select("user_id")
    .ilike("username", username.trim())
    .maybeSingle();
  if (error) return true;
  return !data;
}

export type LearnerOnboardingData = {
  firstName: string;
  lastName: string;
  institutionName: string;
  program: string;
  studentId: string;
  contactNumber?: string;
  batch?: string;
  githubUrl?: string;
  linkedinUrl?: string;
  portfolioUrl?: string;
  bio?: string;
};

export async function createLearnerProfileStub(userId: string, username: string): Promise<void> {
  const stub = {
    user_id: userId,
    username: username.trim(),
    first_name: "",
    last_name: "",
    profile_completed: false,
  };

  const { error } = await supabase.from("learner_profiles").upsert(stub, { onConflict: "user_id" });
  if (error) {
    // Migration not applied — insert without new columns
    const { error: legacyError } = await supabase.from("learner_profiles").upsert(
      { user_id: userId, first_name: "Pending", last_name: "User" },
      { onConflict: "user_id" },
    );
    if (legacyError) throw legacyError;
  }
}

export async function saveLearnerOnboarding(userId: string, data: LearnerOnboardingData): Promise<void> {
  const core = {
    user_id: userId,
    first_name: data.firstName,
    last_name: data.lastName,
    institution_name: data.institutionName,
    program: data.program,
    student_id: data.studentId,
    contact_number: data.contactNumber || null,
    github_url: data.githubUrl || null,
    linkedin_url: data.linkedinUrl || null,
  };

  const withBatch = { ...core, batch: data.batch || null };
  const withOnboarding = {
    ...withBatch,
    portfolio_url: data.portfolioUrl || null,
    bio: data.bio || null,
    profile_completed: true,
  };

  const attempts = [withOnboarding, withBatch, core];
  let lastError: unknown = null;

  for (const payload of attempts) {
    const { error } = await supabase.from("learner_profiles").upsert(payload, { onConflict: "user_id" });
    if (!error) return;
    lastError = error;
    const msg = error.message ?? "";
    if (!/column|schema cache/i.test(msg)) break;
  }

  if (lastError) throw lastError;
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
