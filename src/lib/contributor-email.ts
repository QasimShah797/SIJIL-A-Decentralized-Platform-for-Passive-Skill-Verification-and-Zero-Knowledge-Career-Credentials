/** Public, deliverable address. GitHub noreply addresses are not usable. */
export function isDeliverableContributorEmail(email: string | null | undefined): boolean {
  if (!email?.trim()) return false;
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return false;
  if (normalized.includes("@users.noreply.github.com")) return false;
  if (normalized.endsWith("@github.com")) return false;
  return true;
}

export function deliverableContributorEmail(email: string | null | undefined): string | undefined {
  return isDeliverableContributorEmail(email) ? email!.trim() : undefined;
}
