/**
 * Cryptographic hash utilities (SHA-256).
 */
import { createHash } from "node:crypto";

export function generateSha256Hash(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function generateCredentialUri(userId: string, skillName: string): string {
  const slug = skillName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const compact = userId.replace(/-/g, "").slice(0, 8);
  return `urn:uuid:sijil:${compact}:${slug}:${Date.now()}`;
}
