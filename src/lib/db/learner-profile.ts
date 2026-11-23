import { supabase } from "@/integrations/supabase/client";
import { avatarInitials, displayLearnerDid } from "@/lib/did";
import { resolveLearnerDisplayName } from "@/lib/learner-display-name";
import {
  buildInstitutionDbPayload,
  buildSelfSignupDbPayload,
  combineCityCountry,
  LEARNER_PROFILE_SELECT,
  parseCityCountry,
  stripNonDbColumns,
  type LearnerProfileDbRow,
} from "@/lib/db/learner-profile-schema";
import { meetsOAuthCompletionRequirements } from "@/lib/profile-oauth-verification";
import { loadProfileUiFields, saveProfileUiFields } from "@/lib/profile-ui-fields";

export type { LearnerProfileDbRow as LearnerProfileRow } from "@/lib/db/learner-profile-schema";

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
  /** Derived from city_country — UI display only. */
  city: string | null;
  /** Derived from city_country — UI display only. */
  country: string | null;
  /** UI-only — stored in localStorage, not in learner_profiles. */
  dateOfBirth: string | null;
  /** UI-only — stored in localStorage, not in learner_profiles. */
  gender: string | null;
  /** UI-only — stored in localStorage, not in learner_profiles. */
  graduationYear: number | null;
};

function hasRequiredInstitutionLearnerFields(row: LearnerProfileDbRow | null): boolean {
  if (!row || !row.institution_id) return false;
  return (
    !!row.first_name?.trim() &&
    !!row.last_name?.trim() &&
    !!row.contact_number?.trim() &&
    !!row.city_country?.trim() &&
    !!row.bio?.trim() &&
    !!row.skills_summary?.trim() &&
    !!row.career_goal?.trim() &&
    !!row.institution_name?.trim() &&
    !!row.program?.trim() &&
    !!row.student_id?.trim()
  );
}

export function normalizeLearnerGender(value?: string | null): "male" | "female" | "" {
  return value === "male" || value === "female" ? value : "";
}

export function isValidGraduationYear(year: string | number | null | undefined): boolean {
  if (typeof year === "string" && !/^\d{4}$/.test(year.trim())) return false;
  const value = Number(year);
  return Number.isInteger(value) && value >= 1950 && value <= 2100;
}

export function isInstitutionProvisionedProfile(row: LearnerProfileDbRow | null): boolean {
  return !!row?.institution_id;
}

function persistUiOnlyFields(
  userId: string,
  data: {
    dateOfBirth?: string;
    gender?: string;
    graduationYear?: number | null;
  },
): void {
  const patch: Parameters<typeof saveProfileUiFields>[1] = {};
  if (data.dateOfBirth !== undefined) patch.dateOfBirth = data.dateOfBirth;
  if (data.gender !== undefined) patch.gender = normalizeLearnerGender(data.gender);
  if (data.graduationYear !== undefined) {
    patch.graduationYear = data.graduationYear != null ? String(data.graduationYear) : "";
  }
  if (Object.keys(patch).length > 0) saveProfileUiFields(userId, patch);
}

async function queryLearnerProfileRow(
  userId: string,
): Promise<{ data: LearnerProfileDbRow | null; error: unknown | null }> {
  const { data, error } = await supabase
    .from("learner_profiles")
    .select(LEARNER_PROFILE_SELECT)
    .eq("user_id", userId)
    .maybeSingle();
  return { data: data as LearnerProfileDbRow | null, error };
}

async function completeLearnerProfileRow(
  userId: string,
  payload: Record<string, unknown>,
): Promise<LearnerProfileDbRow> {
  const { data, error } = await supabase
    .from("learner_profiles")
    .update(stripNonDbColumns(payload))
    .eq("user_id", userId)
    .eq("profile_completed", false)
    .select(LEARNER_PROFILE_SELECT)
    .maybeSingle();
  if (error) throw error;
  if (data) return data as LearnerProfileDbRow;

  const existing = await fetchLearnerProfileRow(userId);
  if (existing?.profile_completed) return existing;
  throw new Error("Profile update did not return a row.");
}

export async function isInstitutionProvisionedLearner(userId: string): Promise<boolean> {
  const row = await fetchLearnerProfileRow(userId);
  return !!row?.institution_id;
}

export async function fetchLearnerProfileRow(userId: string): Promise<LearnerProfileDbRow | null> {
  const { data, error } = await queryLearnerProfileRow(userId);
  if (error) throw error;
  return data;
}

export async function fetchLearnerProfile(
  userId: string,
  email?: string | null,
  fullName?: string | null,
): Promise<LearnerProfileView> {
  const data = await fetchLearnerProfileRow(userId);
  const ui = loadProfileUiFields(userId);

  const name = data
    ? resolveLearnerDisplayName(data)
    : resolveLearnerDisplayName({ full_name: fullName ?? undefined, university_email: email ?? undefined });
  const institutionLinked = !!data?.institution_id;
  const location = parseCityCountry(data?.city_country);
  const gradYearRaw = ui.graduationYear?.trim();
  const first = data?.first_name ?? "";
  const last = data?.last_name ?? "";

  return {
    userId,
    name,
    did: displayLearnerDid(data?.holder_did) ?? "",
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
    city: location.city || null,
    country: location.country || null,
    dateOfBirth: ui.dateOfBirth?.trim() || null,
    gender: normalizeLearnerGender(data?.gender ?? ui.gender) || null,
    graduationYear: data?.graduation_year ?? (gradYearRaw ? Number.parseInt(gradYearRaw, 10) : null),
  };
}

function rowToOnboardingForm(
  row: LearnerProfileDbRow,
  email?: string | null,
): {
  firstName: string;
  lastName: string;
  universityEmail: string;
  institutionName: string;
  program: string;
  studentId: string;
  department: string;
  contactNumber: string;
  cityCountry: string;
  batch: string;
  bio: string;
  skillsSummary: string;
  careerGoal: string;
  linkedinUrl: string;
} {
  return {
    firstName: row.first_name?.trim() ?? "",
    lastName: row.last_name?.trim() ?? "",
    universityEmail: row.university_email?.trim() ?? email?.trim() ?? "",
    institutionName: row.institution_name?.trim() ?? "",
    program: row.program?.trim() ?? "",
    studentId: row.student_id?.trim() ?? "",
    department: row.department?.trim() ?? "",
    contactNumber: row.contact_number?.trim() ?? "",
    cityCountry: row.city_country?.trim() ?? "",
    batch: row.batch?.trim() ?? "",
    bio: row.bio?.trim() ?? "",
    skillsSummary: row.skills_summary?.trim() ?? "",
    careerGoal: row.career_goal?.trim() ?? "",
    linkedinUrl: row.linkedin_url?.trim() ?? "",
  };
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

export type LearnerSelfSignupOnboardingData = {
  contactNumber: string;
  /** UI-only — persisted to localStorage, not learner_profiles. */
  dateOfBirth?: string;
  gender?: string;
  country: string;
  city: string;
  institutionName?: string;
  program?: string;
  graduationYear?: number;
  bio: string;
  skillsSummary: string;
  careerGoal: string;
  avatarUrl?: string;
  linkedinUrl?: string | null;
};

export type SelfSignupProfileForm = {
  contactNumber: string;
  dateOfBirth: string;
  gender: string;
  country: string;
  city: string;
  institutionName: string;
  program: string;
  graduationYear: string;
  bio: string;
  skillsSummary: string;
  careerGoal: string;
  linkedinUrl: string;
};

export function rowToSelfSignupForm(row: LearnerProfileDbRow, userId?: string): SelfSignupProfileForm {
  const ui = userId ? loadProfileUiFields(userId) : {};
  const parsed = parseCityCountry(row.city_country);
  const countryOnly = !parsed.country && parsed.city.toLowerCase() === "pakistan";
  return {
    contactNumber: row.contact_number?.trim() ?? "",
    dateOfBirth: ui.dateOfBirth ?? "",
    gender: normalizeLearnerGender(row.gender ?? ui.gender),
    country: countryOnly ? parsed.city : parsed.country,
    city: countryOnly ? "" : parsed.city,
    institutionName: row.institution_name?.trim() ?? "",
    program: row.program?.trim() ?? "",
    graduationYear: row.graduation_year?.toString() ?? ui.graduationYear ?? "",
    bio: row.bio?.trim() ?? "",
    skillsSummary: row.skills_summary?.trim() ?? "",
    careerGoal: row.career_goal?.trim() ?? "",
    linkedinUrl: row.linkedin_url?.trim() ?? "",
  };
}

export type SelfSignupProfileProgressOptions = {
  githubVerified?: boolean;
};

export function selfSignupProfileProgress(
  form: SelfSignupProfileForm,
  opts?: SelfSignupProfileProgressOptions,
): number {
  const checks = [
    form.contactNumber.trim(),
    form.country.trim(),
    form.city.trim(),
    form.institutionName.trim(),
    form.program.trim(),
    isValidGraduationYear(form.graduationYear),
    opts?.githubVerified ? "github" : "",
  ];
  const filled = checks.filter(Boolean).length;
  return Math.round((filled / checks.length) * 100);
}

export async function saveSelfSignupProfileProgress(
  userId: string,
  data: Partial<LearnerSelfSignupOnboardingData>,
): Promise<void> {
  const existing = await fetchLearnerProfileRow(userId);
  if (!existing || existing.institution_id) {
    throw new Error("Only self-registered learners can save this profile.");
  }

  persistUiOnlyFields(userId, data);

  const payload = buildSelfSignupDbPayload({
    contactNumber: data.contactNumber,
    city: data.city,
    country: data.country,
    institutionName: data.institutionName,
    program: data.program,
    bio: data.bio,
    skillsSummary: data.skillsSummary,
    careerGoal: data.careerGoal,
    avatarUrl: data.avatarUrl,
    linkedinUrl: data.linkedinUrl,
  });

  if (data.city !== undefined && !data.city.trim()) payload.city_country = null;
  if (data.gender !== undefined) payload.gender = normalizeLearnerGender(data.gender) || null;
  if (data.graduationYear !== undefined) payload.graduation_year = data.graduationYear;

  const { error } = await supabase
    .from("learner_profiles")
    .update(stripNonDbColumns(payload))
    .eq("user_id", userId)
    .eq("profile_completed", false);
  if (error) throw error;
}

export async function saveSelfSignupOnboarding(
  userId: string,
  data: LearnerSelfSignupOnboardingData,
): Promise<LearnerProfileDbRow> {
  const existing = await fetchLearnerProfileRow(userId);
  if (!existing || existing.institution_id) {
    throw new Error("Only self-registered learners can complete this profile.");
  }
  if (existing.profile_completed) return existing;
  if (![data.contactNumber, data.city, data.country].every((field) => field.trim())) {
    throw new Error("Enter your phone number, city, and country.");
  }
  if (data.gender && !normalizeLearnerGender(data.gender)) {
    throw new Error("Select Male or Female.");
  }
  if (!data.institutionName?.trim() || !data.program?.trim() || !isValidGraduationYear(data.graduationYear)) {
    throw new Error("Enter your institution, program, and a valid graduation year.");
  }

  persistUiOnlyFields(userId, data);

  const payload = buildSelfSignupDbPayload({
    contactNumber: data.contactNumber,
    city: data.city,
    country: data.country,
    institutionName: data.institutionName,
    program: data.program,
    bio: data.bio,
    skillsSummary: data.skillsSummary,
    careerGoal: data.careerGoal,
    avatarUrl: data.avatarUrl,
    linkedinUrl: data.linkedinUrl,
    profileCompleted: true,
  });
  payload.gender = normalizeLearnerGender(data.gender) || null;
  payload.graduation_year = data.graduationYear;

  const oauth = await meetsOAuthCompletionRequirements(userId);
  if (!oauth.github) {
    throw new Error("Connect and verify your GitHub account before completing your profile.");
  }

  return completeLearnerProfileRow(userId, payload);
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
  bio: string;
  skillsSummary: string;
  careerGoal: string;
  avatarUrl?: string;
  linkedinUrl?: string | null;
};

export async function createLearnerProfileStub(userId: string, username: string): Promise<void> {
  const stub = stripNonDbColumns({
    user_id: userId,
    username: username.trim(),
    first_name: "",
    last_name: "",
    profile_completed: false,
  });

  const { error } = await supabase.from("learner_profiles").upsert(stub, { onConflict: "user_id", ignoreDuplicates: true });
  if (error) {
    const { error: legacyError } = await supabase.from("learner_profiles").upsert(
      stripNonDbColumns({ user_id: userId, first_name: "Pending", last_name: "User" }),
      { onConflict: "user_id", ignoreDuplicates: true },
    );
    if (legacyError) throw legacyError;
  }
}

export async function uploadLearnerAvatar(userId: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${userId}/avatar.${ext}`;

  const stalePaths = ["jpg", "jpeg", "png", "webp", "gif"]
    .filter((candidate) => candidate !== ext)
    .map((candidate) => `${userId}/avatar.${candidate}`);
  if (stalePaths.length) {
    await supabase.storage.from("profile-avatars").remove(stalePaths);
  }

  const { error } = await supabase.storage.from("profile-avatars").upload(path, file, {
    upsert: true,
    cacheControl: "0",
  });
  if (error) throw error;

  const { data } = supabase.storage.from("profile-avatars").getPublicUrl(path);
  const separator = data.publicUrl.includes("?") ? "&" : "?";
  return `${data.publicUrl}${separator}v=${Date.now()}`;
}

export async function saveLearnerOnboarding(userId: string, data: LearnerOnboardingData): Promise<LearnerProfileDbRow> {
  const existing = await fetchLearnerProfileRow(userId);
  if (!existing?.institution_id) {
    throw new Error("Only institution-provisioned learners can complete this profile.");
  }
  if (existing.profile_completed) return existing;

  const payload = buildInstitutionDbPayload({
    firstName: data.firstName,
    lastName: data.lastName,
    contactNumber: data.contactNumber,
    cityCountry: data.cityCountry,
    bio: data.bio,
    skillsSummary: data.skillsSummary,
    careerGoal: data.careerGoal,
    avatarUrl: data.avatarUrl,
    linkedinUrl: data.linkedinUrl,
    profileCompleted: true,
  });

  if (!hasRequiredInstitutionLearnerFields({ ...existing, ...payload })) {
    throw new Error("Complete the required institution profile fields.");
  }

  const oauth = await meetsOAuthCompletionRequirements(userId);
  if (!oauth.github) {
    throw new Error("Connect and verify your GitHub account before completing your profile.");
  }

  return completeLearnerProfileRow(userId, payload);
}

/** Persist learner-editable onboarding fields without requiring full completion. */
export async function saveLearnerProfileProgress(
  userId: string,
  data: Partial<LearnerOnboardingData> & Pick<LearnerOnboardingData, "firstName" | "lastName">,
): Promise<void> {
  const existing = await fetchLearnerProfileRow(userId);
  if (!existing?.institution_id) {
    throw new Error("Only institution-provisioned learners can save profile progress.");
  }

  const payload = buildInstitutionDbPayload({
    firstName: data.firstName,
    lastName: data.lastName,
    contactNumber: data.contactNumber,
    cityCountry: data.cityCountry,
    bio: data.bio,
    skillsSummary: data.skillsSummary,
    careerGoal: data.careerGoal,
    avatarUrl: data.avatarUrl,
    linkedinUrl: data.linkedinUrl,
  });

  const { error } = await supabase
    .from("learner_profiles")
    .update(stripNonDbColumns(payload))
    .eq("user_id", userId)
    .eq("profile_completed", false);
  if (error) throw error;
}

export { rowToOnboardingForm };

export type LearnerEditableProfile = {
  contactNumber: string;
  cityCountry?: string;
  /** UI-only; combined into city_country on save. */
  city?: string;
  /** UI-only; combined into city_country on save. */
  country?: string;
  bio: string;
  skillsSummary: string;
  careerGoal: string;
  avatarUrl?: string;
  /** UI-only — saved to localStorage, not learner_profiles. */
  dateOfBirth?: string;
  gender?: string;
  graduationYear?: number | null;
  institutionName?: string;
  program?: string;
  linkedinUrl?: string | null;
};

/** Update learner-editable fields only; institution-verified fields are never changed. */
export async function updateLearnerEditableProfile(
  userId: string,
  data: LearnerEditableProfile,
): Promise<void> {
  const existing = await fetchLearnerProfileRow(userId);
  if (!existing) {
    throw new Error("Learner profile not found.");
  }

  persistUiOnlyFields(userId, data);

  const payload = existing.institution_id
    ? {
        ...buildInstitutionDbPayload({
          contactNumber: data.contactNumber,
          cityCountry: data.cityCountry ?? combineCityCountry(data.city ?? "", data.country ?? ""),
          bio: data.bio,
          skillsSummary: data.skillsSummary,
          careerGoal: data.careerGoal,
          avatarUrl: data.avatarUrl,
          linkedinUrl: data.linkedinUrl,
        }),
      }
    : buildSelfSignupDbPayload({
        contactNumber: data.contactNumber,
        city: data.city,
        country: data.country,
        cityCountry: data.cityCountry,
        bio: data.bio,
        skillsSummary: data.skillsSummary,
        careerGoal: data.careerGoal,
        avatarUrl: data.avatarUrl,
        institutionName: data.institutionName,
        program: data.program,
        linkedinUrl: data.linkedinUrl,
      });

  if (data.gender !== undefined) {
    if (data.gender && !normalizeLearnerGender(data.gender)) throw new Error("Select Male or Female.");
    payload.gender = normalizeLearnerGender(data.gender) || null;
  }
  if (data.graduationYear !== undefined) payload.graduation_year = data.graduationYear;

  const { error } = await supabase
    .from("learner_profiles")
    .update(stripNonDbColumns(payload))
    .eq("user_id", userId);
  if (error) throw error;
}

function mapLearnerDirectoryRow(row: LearnerProfileDbRow): LearnerProfileView & { user_id: string } {
  const location = parseCityCountry(row.city_country);
  const name = resolveLearnerDisplayName(row);
  return {
    userId: row.user_id,
    user_id: row.user_id,
    name,
    did: displayLearnerDid(row.holder_did) ?? "",
    email: "",
    universityEmail: row.university_email ?? null,
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
    city: location.city || null,
    country: location.country || null,
    dateOfBirth: null,
    gender: null,
    graduationYear: null,
  };
}

export async function fetchAllLearnerProfiles(): Promise<(LearnerProfileView & { user_id: string })[]> {
  const { data, error } = await supabase
    .from("learner_profiles")
    .select(LEARNER_PROFILE_SELECT)
    .abortSignal(AbortSignal.timeout(12_000));
  if (error) throw error;
  return (data ?? []).map(mapLearnerDirectoryRow);
}
