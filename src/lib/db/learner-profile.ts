import { supabase } from "@/integrations/supabase/client";
import { avatarInitials, holderDidFromUserId } from "@/lib/did";

export type LearnerProfileView = {
  userId: string;
  name: string;
  did: string;
  email: string;
  universityEmail: string | null;
  studentId: string;
  program: string;
  department: string;
  batch: string;
  institution: string;
  avatar: string;
  avatarUrl: string | null;
  status: string;
  isVerifiedStudent: boolean;
  institutionLinked: boolean;
  githubUrl: string | null;
  linkedinUrl: string | null;
  portfolioUrl: string | null;
  bio: string | null;
  careerGoal: string | null;
  skillsSummary: string | null;
  contactNumber: string | null;
  cityCountry: string | null;
};

export type LearnerProfileRow = {
  first_name?: string | null;
  last_name?: string | null;
  institution_name?: string | null;
  program?: string | null;
  department?: string | null;
  student_id?: string | null;
  contact_number?: string | null;
  city_country?: string | null;
  github_url?: string | null;
  linkedin_url?: string | null;
  portfolio_url?: string | null;
  bio?: string | null;
  career_goal?: string | null;
  skills_summary?: string | null;
  avatar_url?: string | null;
  university_email?: string | null;
  batch?: string | null;
  status?: string | null;
  institution_id?: string | null;
  profile_completed?: boolean | null;
};

function hasRequiredLearnerFields(row: LearnerProfileRow | null): boolean {
  if (!row || !row.institution_id) return false;
  return (
    !!row.first_name?.trim() &&
    !!row.last_name?.trim() &&
    !!row.contact_number?.trim() &&
    !!row.city_country?.trim() &&
    !!row.bio?.trim() &&
    !!row.github_url?.trim() &&
    !!row.linkedin_url?.trim() &&
    !!row.skills_summary?.trim() &&
    !!row.career_goal?.trim() &&
    !!row.institution_name?.trim() &&
    !!row.program?.trim() &&
    !!row.student_id?.trim()
  );
}

export async function isInstitutionProvisionedLearner(userId: string): Promise<boolean> {
  const row = await fetchLearnerProfileRow(userId);
  return !!row?.institution_id;
}

export async function fetchLearnerProfileRow(userId: string): Promise<LearnerProfileRow | null> {
  const { data } = await supabase
    .from("learner_profiles")
    .select(
      "first_name, last_name, institution_name, institution_id, university_email, program, department, student_id, holder_did, batch, status, contact_number, city_country, github_url, linkedin_url, portfolio_url, bio, career_goal, skills_summary, avatar_url, profile_completed, account_activated_at",
    )
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

export async function fetchLearnerProfile(userId: string, email?: string | null): Promise<LearnerProfileView> {
  const data = await fetchLearnerProfileRow(userId);

  const first = data?.first_name ?? "";
  const last = data?.last_name ?? "";
  const name = [first, last].filter(Boolean).join(" ") || email?.split("@")[0] || "Learner";
  const institutionLinked = !!data?.institution_id;

  return {
    userId,
    name,
    did: data?.holder_did ?? holderDidFromUserId(userId),
    email: email ?? data?.university_email ?? "",
    universityEmail: data?.university_email ?? email ?? null,
    studentId: data?.student_id ?? "—",
    program: data?.program ?? "—",
    department: data?.department ?? "—",
    batch: data?.batch ?? "—",
    institution: data?.institution_name ?? "—",
    avatar: data?.avatar_url ? "" : avatarInitials(first, last, name.slice(0, 2).toUpperCase()),
    avatarUrl: data?.avatar_url ?? null,
    status: data?.status ?? "email_pending",
    isVerifiedStudent: institutionLinked && data?.status === "verified",
    institutionLinked,
    githubUrl: data?.github_url ?? null,
    linkedinUrl: data?.linkedin_url ?? null,
    portfolioUrl: data?.portfolio_url ?? null,
    bio: data?.bio ?? null,
    careerGoal: data?.career_goal ?? null,
    skillsSummary: data?.skills_summary ?? null,
    contactNumber: data?.contact_number ?? null,
    cityCountry: data?.city_country ?? null,
  };
}

export async function isLearnerProfileComplete(userId: string): Promise<boolean> {
  const data = await fetchLearnerProfileRow(userId);
  if (!data) return false;
  if (data.profile_completed === true) return true;
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
  department?: string;
  contactNumber: string;
  cityCountry: string;
  batch?: string;
  githubUrl: string;
  linkedinUrl: string;
  portfolioUrl?: string;
  bio: string;
  skillsSummary: string;
  careerGoal: string;
  avatarUrl?: string;
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
    const { error: legacyError } = await supabase.from("learner_profiles").upsert(
      { user_id: userId, first_name: "Pending", last_name: "User" },
      { onConflict: "user_id" },
    );
    if (legacyError) throw legacyError;
  }
}

export async function uploadLearnerAvatar(userId: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${userId}/avatar.${ext}`;
  const { error } = await supabase.storage.from("profile-avatars").upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from("profile-avatars").getPublicUrl(path);
  return data.publicUrl;
}

export async function saveLearnerOnboarding(userId: string, data: LearnerOnboardingData): Promise<void> {
  const existing = await fetchLearnerProfileRow(userId);
  if (!existing?.institution_id) {
    throw new Error("Only institution-provisioned learners can complete this profile.");
  }

  const core: Record<string, unknown> = {
    user_id: userId,
    first_name: data.firstName,
    last_name: data.lastName,
    contact_number: data.contactNumber,
    city_country: data.cityCountry,
    github_url: data.githubUrl,
    linkedin_url: data.linkedinUrl,
    bio: data.bio,
    skills_summary: data.skillsSummary,
    career_goal: data.careerGoal,
    profile_completed: true,
  };

  if (data.portfolioUrl) core.portfolio_url = data.portfolioUrl;
  if (data.avatarUrl) core.avatar_url = data.avatarUrl;

  const { error } = await supabase.from("learner_profiles").upsert(core, { onConflict: "user_id" });
  if (error) throw error;
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
    department: row.department ?? "—",
    batch: row.batch ?? "—",
    institution: row.institution_name ?? "—",
    avatar: avatarInitials(row.first_name, row.last_name),
    avatarUrl: row.avatar_url ?? null,
    status: row.status ?? "email_pending",
    isVerifiedStudent: !!row.institution_id && row.status === "verified",
    institutionLinked: !!row.institution_id,
    githubUrl: row.github_url ?? null,
    linkedinUrl: row.linkedin_url ?? null,
    portfolioUrl: row.portfolio_url ?? null,
    bio: row.bio ?? null,
    careerGoal: row.career_goal ?? null,
    skillsSummary: row.skills_summary ?? null,
    contactNumber: row.contact_number ?? null,
    cityCountry: row.city_country ?? null,
  }));
}
