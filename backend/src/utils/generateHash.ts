/**
 * Cryptographic hash utilities for mock proof generation (SHA-256).
 * Placeholder for future blockchain / ZKP integration.
 */
import { createHash, randomBytes } from "node:crypto";

export function generateSha256Hash(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function generateProofHash(payload: Record<string, unknown>): string {
  const salt = randomBytes(16).toString("hex");
  const canonical = JSON.stringify({ ...payload, salt, ts: Date.now() });
  return generateSha256Hash(canonical);
}

export function generateCredentialUri(userId: string, skillName: string): string {
  const slug = skillName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const compact = userId.replace(/-/g, "").slice(0, 8);
  return `urn:uuid:sijil:${compact}:${slug}:${Date.now()}`;
}
