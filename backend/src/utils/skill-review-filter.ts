import { supabaseService } from "../services/supabase.service";
import { matchesCompetency } from "./moodle-evidence-matching";

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

  return skills.some((skill) => matchesCompetency(review.skill, skill.name));
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
  return invitations.filter((invitation) => reviewMatchesDeclaredSkills(invitation, skills));
}

async function fetchDeclaredSkillRefs(userId: string): Promise<DeclaredSkillRef[]> {
  const { data, error } = await supabaseService.client
    .from("declared_skills")
    .select("id, name")
    .eq("user_id", userId);

  if (error) return [];
  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
  }));
}

export { fetchDeclaredSkillRefs };
