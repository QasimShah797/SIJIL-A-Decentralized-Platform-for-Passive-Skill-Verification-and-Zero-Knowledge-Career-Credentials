/**
 * Canonical Ed25519 proofValue check (base64url, 64 bytes, round-trip identical).
 * Mirrors backend/src/utils/ed25519.ts isCanonicalEd25519ProofValue.
 */
const CANONICAL_PROOF = /^[A-Za-z0-9_-]+$/;
export const ED25519_SIGNATURE_BYTES = 64;

export function isCanonicalEd25519ProofValue(proofValue: string): boolean {
  if (!CANONICAL_PROOF.test(proofValue)) return false;
  const padded = proofValue.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  try {
    const binary = atob(padded + pad);
    if (binary.length !== ED25519_SIGNATURE_BYTES) return false;
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    let encoded = btoa(String.fromCharCode(...bytes));
    encoded = encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    return encoded === proofValue;
  } catch {
    return false;
  }
}
