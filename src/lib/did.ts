import { isDidKeyEd25519 } from "./ssi/did-key";

export { isDidKeyEd25519, isLegacyPlaceholderDid } from "./ssi/did-key";

/**
 * Historical placeholder only. Do not use for new identities, issuance, or profile display.
 * Kept so existing signed credentials can still be recognized as non-cryptographic.
 */
export function holderDidFromUserId(userId: string): string {
  const compact = userId.replace(/-/g, "");
  return `did:key:z6Mk${compact.slice(0, 32)}${compact.slice(-8)}`;
}

/** Real Ed25519 did:key, or null. Never invents a UUID placeholder. */
export function displayLearnerDid(value: string | null | undefined): string | null {
  return value && isDidKeyEd25519(value) ? value : null;
}

export function avatarInitials(firstName?: string | null, lastName?: string | null, fallback = "?"): string {
  const a = (firstName?.trim()?.[0] ?? "").toUpperCase();
  const b = (lastName?.trim()?.[0] ?? "").toUpperCase();
  return (a + b) || fallback;
}
