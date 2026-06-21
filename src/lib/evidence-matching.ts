/** Client-side match reason helper for project evidence display. */
export function buildMatchReasonForSkill(
  skillName: string,
  breakdown: Record<string, number>,
): string | null {
  const skillLower = skillName.trim().toLowerCase();
  const entries = Object.entries(breakdown)
    .filter(([, pct]) => pct > 0)
    .sort((a, b) => b[1] - a[1]);

  for (const [lang, pct] of entries) {
    const langLower = lang.toLowerCase();
    if (
      skillLower === langLower
      || skillLower.includes(langLower)
      || langLower.includes(skillLower)
    ) {
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
