export function normalizedCompetencyText(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function matchesCompetency(value: unknown, competencyName: string): boolean {
  const left = normalizedCompetencyText(value);
  const right = normalizedCompetencyText(competencyName);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

export function matchesCompetencyTags(tags: unknown, competencyName: string): boolean {
  if (!Array.isArray(tags)) return false;
  return tags.some((tag) => {
    if (typeof tag === "string") return matchesCompetency(tag, competencyName);
    if (tag && typeof tag === "object") {
      const row = tag as Record<string, unknown>;
      return matchesCompetency(row.name, competencyName)
        || matchesCompetency(row.shortname, competencyName)
        || matchesCompetency(row.label, competencyName);
    }
    return false;
  });
}

export function lmsEvidenceMatchesSkill(
  row: Record<string, unknown>,
  skillId: string,
  skillName: string,
): boolean {
  if (String(row.linked_skill_id ?? "") === skillId) return true;
  return matchesCompetency(row.course_name, skillName)
    || matchesCompetency(row.text_preview, skillName);
}

export function importedLmsMatchesSkill(
  row: Record<string, unknown>,
  skillName: string,
): boolean {
  return matchesCompetency(row.course_name, skillName)
    || matchesCompetency(row.activity_name, skillName);
}

export function moodleAssignmentMatchesSkill(
  row: Record<string, unknown>,
  skillName: string,
): boolean {
  return matchesCompetencyTags(row.competency_tags, skillName)
    || matchesCompetency(row.name, skillName);
}

export type MoodleTrailEvidence = {
  id: string;
  name: string;
  courseName: string;
  grade: string | null;
  feedback: string | null;
  status: string | null;
  date: string | null;
};
