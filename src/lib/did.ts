/** Deterministic holder DID derived from user id (client-side until key management is wired). */
export function holderDidFromUserId(userId: string): string {
  const compact = userId.replace(/-/g, "");
  return `did:key:z6Mk${compact.slice(0, 32)}${compact.slice(-8)}`;
}

export function avatarInitials(firstName?: string | null, lastName?: string | null, fallback = "?"): string {
  const a = (firstName?.trim()?.[0] ?? "").toUpperCase();
  const b = (lastName?.trim()?.[0] ?? "").toUpperCase();
  return (a + b) || fallback;
}
