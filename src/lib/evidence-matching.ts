/** Client-side match reason helper for project evidence display. */
import { skillRelatesToRepositoryLanguage } from "@/lib/competency-matching";

export function buildMatchReasonForSkill(
  skillName: string,
  breakdown: Record<string, number>,
): string | null {
  const entries = Object.entries(breakdown)
    .filter(([, pct]) => pct > 0)
    .sort((a, b) => b[1] - a[1]);

  for (const [lang, pct] of entries) {
    if (skillRelatesToRepositoryLanguage(skillName, lang)) {
      return `Matched because this repository contains ${Math.round(pct)}% ${lang} code.`;
    }
  }
  return null;
}

export function formatLanguageBreakdown(breakdown: Record<string, number>): string {
  const entries = Object.entries(breakdown)
    .filter(([, pct]) => pct > 0)
    .sort((a, b) => b[1] - a[1]);
  if (!entries.length) return "";
  return entries.map(([lang, pct]) => `${lang} ${Math.round(pct)}%`).join(", ");
}