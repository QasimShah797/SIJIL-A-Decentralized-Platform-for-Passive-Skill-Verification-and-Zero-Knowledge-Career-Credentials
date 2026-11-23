import type { CandidateView } from "@/lib/db/candidates";
import { declaredCompetencyKey } from "@/lib/competency-matching";
import { displaySkill } from "@/lib/recruiter-skills";

/** Skill names used for recruiter dashboard verified-skill statistics (matches Dashboard precedence). */
export function candidateSkillNamesForInsights(candidate: CandidateView): string[] {
  if (candidate.verifiedSkills?.length) return candidate.verifiedSkills;
  if (candidate.searchableSkills?.length) return candidate.searchableSkills;
  if (candidate.topSkill && candidate.topSkill !== "—") return [candidate.topSkill];
  return [];
}

/**
 * Group disclosed skills by normalized competency key; count unique candidates per skill.
 * Display labels use recruiter displaySkill (e.g. java / JAVA → "Java").
 */
export function aggregateRecruiterDashboardSkillCounts(
  candidates: CandidateView[],
  limit = 6,
): Array<[label: string, count: number]> {
  const buckets = new Map<string, { label: string; candidateIds: Set<string> }>();

  for (const candidate of candidates) {
    const keysOnCandidate = new Set<string>();
    for (const skill of candidateSkillNamesForInsights(candidate)) {
      const trimmed = skill.trim();
      if (!trimmed) continue;
      const key = declaredCompetencyKey(trimmed);
      if (!key) continue;
      keysOnCandidate.add(key);
      if (!buckets.has(key)) {
        buckets.set(key, { label: displaySkill(trimmed), candidateIds: new Set() });
      }
    }
    for (const key of keysOnCandidate) {
      buckets.get(key)!.candidateIds.add(candidate.id);
    }
  }

  return [...buckets.entries()]
    .map(([, bucket]) => [bucket.label, bucket.candidateIds.size] as [string, number])
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit);
}