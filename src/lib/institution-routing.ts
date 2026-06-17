const CUST_ALIASES = [
  "cust",
  "capital university of science and technology",
  "capital university of science & technology",
  "capital university of science and technology (cust)",
];

export function normalizeInstitutionName(raw?: string | null): string {
  const value = String(raw ?? "").trim();
  if (!value || value === "—") {
    return "Capital University of Science and Technology";
  }

  const lower = value.toLowerCase();
  if (
    lower.includes("capital university") ||
    lower.includes("science and technology") ||
    lower.includes("cust")
  ) {
    return "Capital University of Science and Technology";
  }

  return value;
}

export function institutionKey(name: string): string {
  const normalized = normalizeInstitutionName(name).toLowerCase();
  if (CUST_ALIASES.some((alias) => normalized.includes(alias) || normalized === "capital university of science and technology")) {
    return "cust";
  }
  return normalized;
}

export function institutionMatches(learnerInstitution: string, viewerInstitution: string): boolean {
  return institutionKey(learnerInstitution) === institutionKey(viewerInstitution);
}

export function institutionDisplayName(name: string): string {
  return normalizeInstitutionName(name);
}
