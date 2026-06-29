import { formatSupabaseError } from "@/lib/utils";

/**
 * Columns present in deployed Supabase migrations before self-signup (20260630120000).
 * Safe to select/update without the self-signup migration applied.
 */
export const LEARNER_PROFILE_BASE_SELECT = [
  "first_name",
  "last_name",
  "institution_name",
  "institution_id",
  "university_email",
  "program",
  "department",
  "student_id",
  "holder_did",
  "batch",
  "status",
  "contact_number",
  "city_country",
  "github_url",
  "linkedin_url",
  "portfolio_url",
  "bio",
  "career_goal",
  "skills_summary",
  "avatar_url",
  "profile_completed",
  "account_activated_at",
].join(", ");

/** Self-signup columns — require migration 20260630120000 / 20260701120000. */
export const LEARNER_PROFILE_SELF_SIGNUP_SELECT = [
  "date_of_birth",
  "gender",
  "country",
  "city",
  "graduation_year",
].join(", ");

export const LEARNER_PROFILE_FULL_SELECT = `${LEARNER_PROFILE_BASE_SELECT}, ${LEARNER_PROFILE_SELF_SIGNUP_SELECT}`;

export const LEARNER_PROFILE_SELF_SIGNUP_WRITE_KEYS = [
  "date_of_birth",
  "gender",
  "country",
  "city",
  "graduation_year",
] as const;

export function isMissingColumnError(err: unknown): boolean {
  if (typeof err === "object" && err !== null) {
    const code = (err as { code?: string }).code;
    if (code === "PGRST204" || code === "42703") return true;
  }
  const msg = formatSupabaseError(err).toLowerCase();
  return (
    msg.includes("column") &&
    (msg.includes("does not exist") ||
      msg.includes("not found") ||
      msg.includes("could not find"))
  );
}

export function stripSelfSignupWriteColumns(payload: Record<string, unknown>): Record<string, unknown> {
  const next = { ...payload };
  for (const key of LEARNER_PROFILE_SELF_SIGNUP_WRITE_KEYS) {
    delete next[key];
  }
  return next;
}

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
