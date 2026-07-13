import { isMissingColumnError } from "@/lib/supabase-errors";

export { isMissingColumnError };

export {
  LEARNER_PROFILE_DB_COLUMNS,
  LEARNER_PROFILE_SELECT,
  type LearnerProfileDbRow,
  type LearnerProfileDbInsert,
  type LearnerProfileDbUpdate,
  type LearnerProfileUiOnly,
  parseCityCountry,
  combineCityCountry,
  stripNonDbColumns,
  buildSelfSignupDbPayload,
  buildInstitutionDbPayload,
} from "@/lib/db/learner-profile-schema";

/** @deprecated Use LEARNER_PROFILE_DB_COLUMNS */
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
