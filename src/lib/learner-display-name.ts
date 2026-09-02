export type LearnerNameSource = {
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  university_email?: string | null;
  full_name?: string | null;
};

/** Best available public display name when legal name fields are empty or stubbed. */
export function resolveLearnerDisplayName(source: LearnerNameSource | null | undefined): string {
  if (!source) return "Learner";

  const explicitFull = source.full_name?.trim();
  if (explicitFull && explicitFull.toLowerCase() !== "pending user") {
    return explicitFull;
  }

  const first = source.first_name?.trim() ?? "";
  const last = source.last_name?.trim() ?? "";
  const full = [first, last].filter(Boolean).join(" ");

  if (full && full.toLowerCase() !== "pending user") {
    return full;
  }

  const username = source.username?.trim();
  if (username) return username;

  const email = source.university_email?.trim();
  if (email) {
    const local = email.split("@")[0]?.trim();
    if (local) {
      return local
        .replace(/[._-]+/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());
    }
  }

  return "Learner";
}
