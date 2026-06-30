import { isMissingColumnError } from "@/lib/supabase-errors";

export { isMissingColumnError };

/**
 * Columns confirmed on the live Supabase project (via `supabase gen types`).
 * Reads should use `.select("*")` — PostgREST only returns columns that exist.
 */
export const LEARNER_PROFILE_REMOTE_COLUMNS = [
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
] as const;

/** Requires migration 20260705120000_remote_schema_alignment.sql (or earlier self-signup migrations). */
export const LEARNER_PROFILE_SELF_SIGNUP_WRITE_KEYS = [
  "date_of_birth",
  "gender",
  "country",
  "city",
  "graduation_year",
] as const;

/** @deprecated Use select("*") instead. Kept for update().select() fallbacks. */
export const LEARNER_PROFILE_BASE_SELECT = LEARNER_PROFILE_REMOTE_COLUMNS.filter(
  (c) => c !== "user_id" && c !== "created_at" && c !== "updated_at",
).join(", ");

/** @deprecated Self-signup columns are not on the remote DB yet. */
export const LEARNER_PROFILE_SELF_SIGNUP_SELECT = LEARNER_PROFILE_SELF_SIGNUP_WRITE_KEYS.join(", ");

/** @deprecated Prefer select("*"). */
export const LEARNER_PROFILE_FULL_SELECT = `${LEARNER_PROFILE_BASE_SELECT}, ${LEARNER_PROFILE_SELF_SIGNUP_SELECT}`;

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
