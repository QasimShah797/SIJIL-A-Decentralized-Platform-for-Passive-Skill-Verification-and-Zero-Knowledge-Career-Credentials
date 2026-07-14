/**
 * Keep peer-review and evidence views scoped to currently declared competencies.
 */
export type DeclaredSkillRef = {
  id: string;
  name: string;
};

export function normalizeSkillName(value: string): string {
  return value.trim().toLowerCase();
}

export function reviewMatchesDeclaredSkills(
  review: { skill: string; skillId?: string | null },
  skills: DeclaredSkillRef[],
): boolean {
  if (!skills.length) return false;

  const ids = new Set(skills.map((skill) => skill.id));
  if (review.skillId && ids.has(review.skillId)) return true;

  const names = new Set(skills.map((skill) => normalizeSkillName(skill.name)));
  return names.has(normalizeSkillName(review.skill));
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

  const ids = new Set(skills.map((skill) => skill.id));
  const names = new Set(skills.map((skill) => normalizeSkillName(skill.name)));

  if (project.skillLinks?.some((link) => ids.has(link.skillId))) return true;
  if (project.linkedSkills?.some((name) => names.has(normalizeSkillName(name)))) return true;

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

  const ids = new Set(skills.map((skill) => skill.id));
  const names = new Set(skills.map((skill) => normalizeSkillName(skill.name)));

  return projects
    .map((project) => {
      const skillLinks = (project.skillLinks ?? []).filter((link) => ids.has(link.skillId));
      const linkedSkills = (project.linkedSkills ?? []).filter((name) =>
        names.has(normalizeSkillName(name)),
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
