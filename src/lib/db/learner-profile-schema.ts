import type { Database } from "@/integrations/supabase/types";

/** Canonical row type — matches `supabase gen types` / live `public.learner_profiles`. */
export type LearnerProfileDbRow = Database["public"]["Tables"]["learner_profiles"]["Row"];
export type LearnerProfileDbInsert = Database["public"]["Tables"]["learner_profiles"]["Insert"];
export type LearnerProfileDbUpdate = Database["public"]["Tables"]["learner_profiles"]["Update"];

/**
 * Confirmed columns on the live Supabase project.
 * Source: src/integrations/supabase/types.ts (generated from remote schema).
 */
export const LEARNER_PROFILE_DB_COLUMNS = [
  "user_id",
  "first_name",
  "last_name",
  "contact_number",
  "institution_name",
  "institution_id",
  "university_email",
  "program",
  "department",
  "student_id",
  "github_url",
  "linkedin_url",
  "portfolio_url",
  "bio",
  "career_goal",
  "skills_summary",
  "avatar_url",
  "batch",
  "holder_did",
  "profile_completed",
  "account_activated_at",
  "city_country",
  "status",
  "username",
  "created_at",
  "updated_at",
] as const satisfies readonly (keyof LearnerProfileDbRow)[];

/** All reads use select("*") — PostgREST returns only columns that exist. */
export const LEARNER_PROFILE_SELECT = "*";

/** Fields shown in forms but not persisted to learner_profiles (no migration yet). */
export type LearnerProfileUiOnly = {
  dateOfBirth: string;
  gender: string;
  graduationYear: string;
  city: string;
  country: string;
};

export function parseCityCountry(cityCountry: string | null | undefined): { city: string; country: string } {
  const raw = cityCountry?.trim();
  if (!raw) return { city: "", country: "" };
  const comma = raw.indexOf(",");
  if (comma === -1) return { city: raw, country: "" };
  return {
    city: raw.slice(0, comma).trim(),
    country: raw.slice(comma + 1).trim(),
  };
}

/** Combine UI-only city/country fields into the single DB column. */
export function combineCityCountry(city: string, country: string): string | null {
  const c = city.trim();
  const co = country.trim();
  if (c && co) return `${c}, ${co}`;
  return c || co || null;
}

/** Drop any key that is not a real learner_profiles column before Supabase writes. */
export function stripNonDbColumns(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of LEARNER_PROFILE_DB_COLUMNS) {
    if (key in payload && payload[key] !== undefined) {
      out[key] = payload[key];
    }
  }
  return out;
}

export type SelfSignupDbInput = {
  contactNumber?: string;
  city?: string;
  country?: string;
  cityCountry?: string;
  institutionName?: string;
  program?: string;
  bio?: string;
  skillsSummary?: string;
  careerGoal?: string;
  avatarUrl?: string;
  linkedinUrl?: string | null;
  profileCompleted?: boolean;
};

export type InstitutionDbInput = {
  firstName?: string;
  lastName?: string;
  contactNumber?: string;
  cityCountry?: string;
  bio?: string;
  skillsSummary?: string;
  careerGoal?: string;
  avatarUrl?: string;
  linkedinUrl?: string | null;
  profileCompleted?: boolean;
};

/** Map self-signup / editable form values to a DB-safe update payload. */
export function buildSelfSignupDbPayload(data: SelfSignupDbInput): LearnerProfileDbUpdate {
  const payload: Record<string, unknown> = {};

  if (data.contactNumber !== undefined) payload.contact_number = data.contactNumber.trim();
  if (data.institutionName !== undefined) payload.institution_name = data.institutionName.trim() || null;
  if (data.program !== undefined) payload.program = data.program.trim() || null;
  if (data.bio !== undefined) payload.bio = data.bio.trim();
  if (data.skillsSummary !== undefined) payload.skills_summary = data.skillsSummary.trim();
  if (data.careerGoal !== undefined) payload.career_goal = data.careerGoal.trim();
  if (data.avatarUrl) payload.avatar_url = data.avatarUrl;
  if (data.linkedinUrl !== undefined) payload.linkedin_url = data.linkedinUrl;
  if (data.profileCompleted !== undefined) payload.profile_completed = data.profileCompleted;

  if (data.cityCountry !== undefined) {
    payload.city_country = data.cityCountry.trim() || null;
  } else if (data.city !== undefined || data.country !== undefined) {
    payload.city_country = combineCityCountry(data.city ?? "", data.country ?? "");
  }

  return stripNonDbColumns(payload) as LearnerProfileDbUpdate;
}

/** Map institution onboarding form values to a DB-safe update payload. */
export function buildInstitutionDbPayload(data: InstitutionDbInput): LearnerProfileDbUpdate {
  const payload: Record<string, unknown> = {};

  if (data.firstName !== undefined) payload.first_name = data.firstName.trim();
  if (data.lastName !== undefined) payload.last_name = data.lastName.trim();
  if (data.contactNumber !== undefined) payload.contact_number = data.contactNumber.trim();
  if (data.cityCountry !== undefined) payload.city_country = data.cityCountry.trim();
  if (data.bio !== undefined) payload.bio = data.bio.trim();
  if (data.skillsSummary !== undefined) payload.skills_summary = data.skillsSummary.trim();
  if (data.careerGoal !== undefined) payload.career_goal = data.careerGoal.trim();
  if (data.avatarUrl) payload.avatar_url = data.avatarUrl;
  if (data.linkedinUrl !== undefined) payload.linkedin_url = data.linkedinUrl;
  if (data.profileCompleted !== undefined) payload.profile_completed = data.profileCompleted;

  return stripNonDbColumns(payload) as LearnerProfileDbUpdate;
}
