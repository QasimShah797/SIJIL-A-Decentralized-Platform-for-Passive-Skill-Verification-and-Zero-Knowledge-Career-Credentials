/**
 * User-facing labels for skill/competency confirmation (not email, identity, or crypto verification).
 * Internal API values and enums are unchanged — use these helpers at display boundaries only.
 */

export const CONFIRMED_SKILLS_LABEL = "Confirmed Skills";
export const CONFIRMED_COMPETENCIES_LABEL = "Confirmed Competencies";
export const CONFIRMED_LABEL = "Confirmed";
export const SKILL_STATUS_LABEL = "Skill Status";
export const UNDER_REVIEW_LABEL = "Under Review";
export const SKILL_CONFIRMED_LABEL = "Skill Confirmed";
export const CONFIRMATION_UNSUCCESSFUL_LABEL = "Confirmation Unsuccessful";
export const SKILL_CONFIRMATION_DETAILS_LABEL = "Skill Confirmation Details";
export const SKILL_CONFIRMATION_SUMMARY_LABEL = "Skill confirmation summary";
export const NOT_CONFIRMED_LABEL = "Not confirmed";

/** Display backend or wallet skill-status strings without implying confirmation when pending. */
export function displaySkillStatusValue(value: string | null | undefined): string {
  if (value == null || !String(value).trim()) return NOT_CONFIRMED_LABEL;
  const raw = String(value).trim();
  const lower = raw.toLowerCase();

  if (lower === "unverified" || lower === "not verified") return NOT_CONFIRMED_LABEL;
  if (lower === "verified" || lower === "competency verified") return SKILL_CONFIRMED_LABEL;
  if (lower.includes("credential issued") || lower.includes("passed") || lower === "approved") {
    return CONFIRMED_LABEL;
  }
  if (
    lower.includes("verification pending")
    || lower.includes("pending verification")
    || lower.includes("awaiting verification")
    || lower === "pending review"
  ) {
    return UNDER_REVIEW_LABEL;
  }
  if (lower.includes("verification failed") || lower.includes("failed")) {
    return CONFIRMATION_UNSUCCESSFUL_LABEL;
  }

  return raw
    .replace(/\bVerification Pending\b/gi, UNDER_REVIEW_LABEL)
    .replace(/\bPending Verification\b/gi, UNDER_REVIEW_LABEL)
    .replace(/\bVerification Failed\b/gi, CONFIRMATION_UNSUCCESSFUL_LABEL)
    .replace(/\bVerification Successful\b/gi, SKILL_CONFIRMED_LABEL)
    .replace(/\bVerification Status\b/gi, SKILL_STATUS_LABEL)
    .replace(/\bUnverified\b/gi, NOT_CONFIRMED_LABEL);
}