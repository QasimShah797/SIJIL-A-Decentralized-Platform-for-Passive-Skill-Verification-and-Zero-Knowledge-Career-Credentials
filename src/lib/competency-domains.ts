/** E1-US3 / E1-US4 — competency declaration domain options */
export const COMPETENCY_DOMAIN_OTHER = "Other";

export const COMPETENCY_DOMAINS = [
  "Frontend Development",
  "Backend Development",
  "Full Stack Development",
  "Mobile App Development",
  "Database Management",
  "Cloud Computing",
  "DevOps",
  "Cybersecurity",
  "Artificial Intelligence",
  "Machine Learning",
  "Data Science",
  "UI/UX Design",
  "Software Testing / QA",
  "Software Project Management",
  "Blockchain / Web3",
  "API Development",
  "LMS / Educational Technology",
  "General Programming",
  COMPETENCY_DOMAIN_OTHER,
] as const;

export type CompetencyDomainOption = (typeof COMPETENCY_DOMAINS)[number];

export function resolveCompetencyDomain(select: string, custom: string): string {
  if (select === COMPETENCY_DOMAIN_OTHER) return custom.trim();
  return select;
}

export function splitCompetencyDomain(stored: string): { select: string; custom: string } {
  if ((COMPETENCY_DOMAINS as readonly string[]).includes(stored)) {
    return { select: stored, custom: "" };
  }
  if (stored && stored !== "General") {
    return { select: COMPETENCY_DOMAIN_OTHER, custom: stored };
  }
  return { select: "", custom: "" };
}
