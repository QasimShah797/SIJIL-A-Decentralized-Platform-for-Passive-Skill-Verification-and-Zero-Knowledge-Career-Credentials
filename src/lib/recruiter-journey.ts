export type DisclosedCompetencyVersion = {
  id: string;
  skill: string;
  issuedAt: string;
  issuer: string | null;
  status: string;
};

export function competencyJourney(
  credentials: Array<{ id: string; skill: string; issuedAt: string; issuer?: string | null; status?: string | null }>,
  skill: string,
): DisclosedCompetencyVersion[] {
  const wanted = skill.trim().toLowerCase();
  return credentials
    .filter((row) => row.skill.trim().toLowerCase() === wanted && row.id && row.issuedAt)
    .map((row) => ({
      id: row.id,
      skill: row.skill,
      issuedAt: row.issuedAt,
      issuer: row.issuer?.trim() || null,
      status: row.status?.trim() || "Shared",
    }))
    .sort((left, right) => Date.parse(left.issuedAt) - Date.parse(right.issuedAt));
}
