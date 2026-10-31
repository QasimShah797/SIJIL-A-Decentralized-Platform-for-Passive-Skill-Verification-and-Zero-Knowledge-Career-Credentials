/**
 * Keep peer-review and evidence views scoped to currently declared competencies.
 * A record matches an exact competency id, or an equal normalized name.
 * A shorter name inside a longer name is not a match.
 */
export type DeclaredSkillRef = {
  id: string;
  name: string;
};

export function normalizeSkillName(value: string): string {
  return value.trim().toLowerCase();
}

function declaredIds(skills: DeclaredSkillRef[]): Set<string> {
  return new Set(skills.map((skill) => skill.id).filter((id) => id.length > 0));
}

function declaredNames(skills: DeclaredSkillRef[]): Set<string> {
  return new Set(
    skills
      .map((skill) => normalizeSkillName(skill.name))
      .filter((name) => name.length > 0),
  );
}

function nameEqualsDeclared(value: string, names: Set<string>): boolean {
  const normalized = normalizeSkillName(value);
  return normalized.length > 0 && names.has(normalized);
}

export function reviewMatchesDeclaredSkills(
  review: { skill: string; skillId?: string | null },
  skills: DeclaredSkillRef[],
): boolean {
  if (!skills.length) return false;
  if (review.skillId && declaredIds(skills).has(review.skillId)) return true;
  return nameEqualsDeclared(review.skill, declaredNames(skills));
}

export function invitationMatchesDeclaredSkills(
  invitation: { skill: string; skillId?: string | null },
  skills: DeclaredSkillRef[],
): boolean {
  return reviewMatchesDeclaredSkills(invitation, skills);
}

export function projectMatchesDeclaredSkills(
  project: {
    linkedSkills?: string[];
    skillLinks?: Array<{ skillId: string; skillName: string }>;
  },
  skills: DeclaredSkillRef[],
): boolean {
  if (!skills.length) return false;

  const ids = declaredIds(skills);
  const names = declaredNames(skills);

  if (project.skillLinks?.some((link) => ids.has(link.skillId) || nameEqualsDeclared(link.skillName, names))) return true;
  if (project.linkedSkills?.some((name) => nameEqualsDeclared(name, names))) return true;

  return false;
}

export function filterProjectsForDeclaredSkills<T extends {
  linkedSkills?: string[];
  skillLinks?: Array<{ skillId: string; skillName: string }>;
}>(
  projects: T[],
  skills: DeclaredSkillRef[],
): T[] {
  if (!skills.length) return [];

  const ids = declaredIds(skills);
  const names = declaredNames(skills);

  return projects
    .map((project) => {
      const skillLinks = (project.skillLinks ?? []).filter((link) =>
        ids.has(link.skillId) || nameEqualsDeclared(link.skillName, names),
      );
      const linkedSkills = (project.linkedSkills ?? []).filter((name) =>
        nameEqualsDeclared(name, names),
      );
      return { ...project, skillLinks, linkedSkills };
    })
    .filter((project) =>
      (project.skillLinks?.length ?? 0) > 0 || (project.linkedSkills?.length ?? 0) > 0,
    );
}

export function filterReviewsForDeclaredSkills<T extends { skill: string; skillId?: string | null }>(
  reviews: T[],
  skills: DeclaredSkillRef[],
): T[] {
  if (!skills.length) return [];
  return reviews.filter((review) => reviewMatchesDeclaredSkills(review, skills));
}

export function filterInvitationsForDeclaredSkills<T extends { skill: string; skillId?: string | null }>(
  invitations: T[],
  skills: DeclaredSkillRef[],
): T[] {
  if (!skills.length) return [];
  return invitations.filter((invitation) => invitationMatchesDeclaredSkills(invitation, skills));
}
