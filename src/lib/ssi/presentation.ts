/**
 * SIJIL SSI Phase 3 Step 1 — browser-side presentation signing claims.
 *
 * Exact signed UTF-8 bytes = RFC 8785 JCS of PresentationSigningClaims.
 * Sign with existing `signUtf8` (Ed25519 over those bytes).
 * Cryptosuite name: sijil-ed25519-jcs-utf8-2026. Not W3C eddsa-jcs-2022.
 */
import { canonicalizeJson } from "./canonicalize";
import { encodeDidKeyFromRawPublicKey, resolveDidKey } from "./did-key";
import { isUsablePrivateKey, signUtf8, type StoredSsiIdentity } from "./keystore";

export const SSI_PRESENT_PROTOCOL = "SIJIL-SSI-PRESENT-v1" as const;
export const SSI_PRESENT_PURPOSE = "present-credentials" as const;
export const SSI_PRESENT_CRYPTOSUITE = "sijil-ed25519-jcs-utf8-2026" as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH_RE = /^[0-9a-f]{64}$/;
const NONCE_RE = /^[A-Za-z0-9_-]{32,128}$/;
const ISO_MS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const AUDIENCE_RE = /^[\x21-\x7E]{1,256}$/;

export type PresentationCredentialRef = {
  id: string;
  hash: string;
};

export type PresentationSigningClaims = {
  protocol: typeof SSI_PRESENT_PROTOCOL;
  purpose: typeof SSI_PRESENT_PURPOSE;
  challengeId: string;
  nonce: string;
  audience: string;
  holderDid: string;
  credentials: PresentationCredentialRef[];
  issuedAt: string;
  expiresAt: string;
};

function fail(message: string): never {
  throw new Error(message);
}

function asTrimmedString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) {
    fail(`${field} must be a non-empty trimmed string`);
  }
  return value;
}

function asUuid(value: unknown, field: string): string {
  const text = asTrimmedString(value, field).toLowerCase();
  if (!UUID_RE.test(text)) fail(`${field} must be a UUID`);
  return text;
}

function asHash(value: unknown, field: string): string {
  const text = asTrimmedString(value, field).toLowerCase();
  if (!HASH_RE.test(text)) fail(`${field} must be a 64-char lowercase SHA-256 hex digest`);
  return text;
}

function asIsoMs(value: unknown, field: string): string {
  const text = asTrimmedString(value, field);
  if (!ISO_MS_RE.test(text)) fail(`${field} must be UTC ISO-8601 with milliseconds`);
  const ms = Date.parse(text);
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== text) {
    fail(`${field} is not a canonical UTC timestamp`);
  }
  return text;
}

function canonicalBase64Url(text: string): boolean {
  try {
    const padded = text.replace(/-/g, "+").replace(/_/g, "/");
    const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
    const binary = atob(padded + pad);
    if (binary.length < 16) return false;
    const encoded = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    return encoded === text;
  } catch {
    return false;
  }
}

function asNonce(value: unknown): string {
  const text = asTrimmedString(value, "nonce");
  if (!NONCE_RE.test(text) || !canonicalBase64Url(text)) {
    fail("nonce must be canonical base64url at least 16 bytes");
  }
  return text;
}

function asAudience(value: unknown): string {
  const text = asTrimmedString(value, "audience");
  if (!AUDIENCE_RE.test(text)) fail("audience must be 1-256 printable ASCII characters without spaces");
  return text;
}

function asHolderDid(value: unknown): string {
  const text = asTrimmedString(value, "holderDid");
  try {
    const resolved = resolveDidKey(text);
    const canonical = encodeDidKeyFromRawPublicKey(resolved.publicKey);
    if (canonical !== resolved.did) fail("holderDid must be a canonical Ed25519 did:key");
    return canonical;
  } catch (err) {
    fail(err instanceof Error ? err.message : "holderDid must be a canonical Ed25519 did:key");
  }
}

function sortCredentialRefs(refs: PresentationCredentialRef[]): PresentationCredentialRef[] {
  return [...refs].sort((left, right) => {
    const byId = left.id.localeCompare(right.id);
    return byId !== 0 ? byId : left.hash.localeCompare(right.hash);
  });
}

export function buildPresentationSigningClaims(input: {
  challengeId: string;
  nonce: string;
  audience: string;
  holderDid: string;
  credentials: Array<{ id: string; hash: string }>;
  issuedAt: string;
  expiresAt: string;
}): PresentationSigningClaims {
  const challengeId = asUuid(input.challengeId, "challengeId");
  const nonce = asNonce(input.nonce);
  const audience = asAudience(input.audience);
  const issuedAt = asIsoMs(input.issuedAt, "issuedAt");
  const expiresAt = asIsoMs(input.expiresAt, "expiresAt");
  if (Date.parse(issuedAt) >= Date.parse(expiresAt)) fail("expiresAt must be after issuedAt");
  if (!Array.isArray(input.credentials) || input.credentials.length === 0) {
    fail("credentials must be a non-empty array");
  }
  const holderDid = asHolderDid(input.holderDid);
  const refs = sortCredentialRefs(
    input.credentials.map((row, index) => ({
      id: asUuid(row.id, `credentials[${index}].id`),
      hash: asHash(row.hash, `credentials[${index}].hash`),
    })),
  );
  if (new Set(refs.map((row) => row.id)).size !== refs.length) fail("credential IDs must be unique");
  if (new Set(refs.map((row) => row.hash)).size !== refs.length) fail("credential hashes must be unique");
  return {
    protocol: SSI_PRESENT_PROTOCOL,
    purpose: SSI_PRESENT_PURPOSE,
    challengeId,
    nonce,
    audience,
    holderDid,
    credentials: refs,
    issuedAt,
    expiresAt,
  };
}

export function canonicalPresentationPayload(claims: PresentationSigningClaims): string {
  const normalized = buildPresentationSigningClaims(claims);
  return canonicalizeJson({
    audience: normalized.audience,
    challengeId: normalized.challengeId,
    credentials: normalized.credentials.map((row) => ({ hash: row.hash, id: row.id })),
    expiresAt: normalized.expiresAt,
    holderDid: normalized.holderDid,
    issuedAt: normalized.issuedAt,
    nonce: normalized.nonce,
    protocol: normalized.protocol,
    purpose: normalized.purpose,
  });
}

export async function signPresentationClaims(
  record: StoredSsiIdentity,
  claims: PresentationSigningClaims,
): Promise<string> {
  if (!isUsablePrivateKey(record.privateKey)) {
    throw new Error("Private key is not usable");
  }
  const normalized = buildPresentationSigningClaims(claims);
  if (record.did !== normalized.holderDid) {
    throw new Error("Signing DID does not match presentation holder");
  }
  return signUtf8(record.privateKey, canonicalPresentationPayload(normalized));
}
