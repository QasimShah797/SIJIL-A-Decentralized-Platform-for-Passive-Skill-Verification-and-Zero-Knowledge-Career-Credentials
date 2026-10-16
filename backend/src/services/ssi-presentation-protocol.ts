/**
 * SIJIL SSI Phase 3 Step 1 — learner-signed Verifiable Presentation protocol.
 *
 * Signed bytes (UTF-8): RFC 8785 JCS of PresentationSigningClaims.
 * Holder cryptosuite: sijil-ed25519-jcs-utf8-2026 (Ed25519 over those UTF-8 bytes).
 * This is NOT W3C eddsa-jcs-2022 (that suite hashes JCS, then signs the digest).
 * Issuer proofs on embedded credentials stay DataIntegrityProof / eddsa-jcs-2022.
 */
import { canonicalizeJson } from "../utils/canonicalize";
import { canonicalSsiBindingFromDid } from "../utils/did-key";
import { isCanonicalEd25519ProofValue, verifyEd25519Utf8 } from "../utils/ed25519";
import { generateSha256Hash } from "../utils/generateHash";
import type { CredentialDocument } from "./credential-document.service";

/** Must stay aligned with `signing.service.ts`. Imported as literals so this module does not load env. */
const ISSUER_PROOF_TYPE = "DataIntegrityProof";
const ISSUER_CRYPTOSUITE = "eddsa-jcs-2022";

export const SSI_PRESENT_PROTOCOL = "SIJIL-SSI-PRESENT-v1";
export const SSI_PRESENT_PURPOSE = "present-credentials";
export const SSI_PRESENT_CRYPTOSUITE = "sijil-ed25519-jcs-utf8-2026";
export const SSI_PRESENT_PROOF_TYPE = "DataIntegrityProof";
export const SSI_PRESENT_PROOF_PURPOSE = "authentication";
export const SSI_PRESENT_CONTEXT = "https://www.w3.org/ns/credentials/v2";

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

export type PresentationChallengeInput = {
  challengeId: string;
  nonce: string;
  audience: string;
  credentialIds: string[];
  issuedAt: string;
  expiresAt: string;
};

export type IssuerCredentialProof = {
  type: string;
  cryptosuite: string;
  created: string;
  verificationMethod: string;
  proofValue: string;
  proofPurpose: string;
};

export type EmbeddedVerifiableCredential = CredentialDocument & {
  proof: IssuerCredentialProof;
};

export type LearnerPresentationProof = {
  type: typeof SSI_PRESENT_PROOF_TYPE;
  cryptosuite: typeof SSI_PRESENT_CRYPTOSUITE;
  created: string;
  expires: string;
  verificationMethod: string;
  proofPurpose: typeof SSI_PRESENT_PROOF_PURPOSE;
  challenge: string;
  nonce: string;
  domain: string;
  protocol: typeof SSI_PRESENT_PROTOCOL;
  proofValue: string;
};

export type SijilVerifiablePresentation = {
  "@context": [typeof SSI_PRESENT_CONTEXT];
  type: ["VerifiablePresentation"];
  holder: string;
  verifiableCredential: EmbeddedVerifiableCredential[];
  sijilCredentialIds: string[];
  proof: LearnerPresentationProof;
};

export type PresentationVerifyFailure =
  | "malformed"
  | "expired"
  | "invalid_signature"
  | "holder_mismatch"
  | "credential_mismatch";

export type PresentationVerifyResult =
  | { ok: true; claims: PresentationSigningClaims }
  | { ok: false; reason: PresentationVerifyFailure; message: string };

export class PresentationProtocolError extends Error {
  readonly reason: PresentationVerifyFailure;

  constructor(reason: PresentationVerifyFailure, message: string) {
    super(message);
    this.name = "PresentationProtocolError";
    this.reason = reason;
  }
}

function fail(reason: PresentationVerifyFailure, message: string): never {
  throw new PresentationProtocolError(reason, message);
}

function asTrimmedString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) {
    fail("malformed", `${field} must be a non-empty trimmed string`);
  }
  return value;
}

function asUuid(value: unknown, field: string): string {
  const text = asTrimmedString(value, field).toLowerCase();
  if (!UUID_RE.test(text)) fail("malformed", `${field} must be a UUID`);
  return text;
}

function asHash(value: unknown, field: string): string {
  const text = asTrimmedString(value, field).toLowerCase();
  if (!HASH_RE.test(text)) fail("malformed", `${field} must be a 64-char lowercase SHA-256 hex digest`);
  return text;
}

function asIsoMs(value: unknown, field: string): string {
  const text = asTrimmedString(value, field);
  if (!ISO_MS_RE.test(text)) fail("malformed", `${field} must be UTC ISO-8601 with milliseconds`);
  const ms = Date.parse(text);
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== text) {
    fail("malformed", `${field} is not a canonical UTC timestamp`);
  }
  return text;
}

function asNonce(value: unknown): string {
  const text = asTrimmedString(value, "nonce");
  if (!NONCE_RE.test(text)) fail("malformed", "nonce must be unpadded base64url");
  const decoded = Buffer.from(text, "base64url");
  if (decoded.byteLength < 16 || decoded.toString("base64url") !== text) {
    fail("malformed", "nonce must be canonical base64url at least 16 bytes");
  }
  return text;
}

function asAudience(value: unknown): string {
  const text = asTrimmedString(value, "audience");
  if (!AUDIENCE_RE.test(text)) fail("malformed", "audience must be 1-256 printable ASCII characters without spaces");
  return text;
}

function asHolderDid(value: unknown): string {
  const text = asTrimmedString(value, "holderDid");
  try {
    return canonicalSsiBindingFromDid(text).did;
  } catch {
    fail("malformed", "holderDid must be a canonical Ed25519 did:key");
  }
}

function sortCredentialRefs(refs: PresentationCredentialRef[]): PresentationCredentialRef[] {
  return [...refs].sort((left, right) => {
    const byId = left.id.localeCompare(right.id);
    return byId !== 0 ? byId : left.hash.localeCompare(right.hash);
  });
}

export function hashUnsignedCredentialDocument(document: unknown): string {
  return generateSha256Hash(canonicalizeJson(document));
}

export function buildPresentationChallengeFields(input: PresentationChallengeInput): {
  challengeId: string;
  nonce: string;
  audience: string;
  credentialIds: string[];
  issuedAt: string;
  expiresAt: string;
} {
  const challengeId = asUuid(input.challengeId, "challengeId");
  const nonce = asNonce(input.nonce);
  const audience = asAudience(input.audience);
  const issuedAt = asIsoMs(input.issuedAt, "issuedAt");
  const expiresAt = asIsoMs(input.expiresAt, "expiresAt");
  if (Date.parse(issuedAt) >= Date.parse(expiresAt)) {
    fail("malformed", "expiresAt must be after issuedAt");
  }
  if (!Array.isArray(input.credentialIds) || input.credentialIds.length === 0) {
    fail("malformed", "credentialIds must be a non-empty array");
  }
  const credentialIds = input.credentialIds.map((id, index) => asUuid(id, `credentialIds[${index}]`));
  const unique = new Set(credentialIds);
  if (unique.size !== credentialIds.length) fail("malformed", "credentialIds must be unique");
  return {
    challengeId,
    nonce,
    audience,
    credentialIds: [...credentialIds].sort((a, b) => a.localeCompare(b)),
    issuedAt,
    expiresAt,
  };
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
  const challenge = buildPresentationChallengeFields({
    challengeId: input.challengeId,
    nonce: input.nonce,
    audience: input.audience,
    credentialIds: input.credentials.map((row) => row.id),
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
  });
  const holderDid = asHolderDid(input.holderDid);
  if (input.credentials.length !== challenge.credentialIds.length) {
    fail("malformed", "credentials must include exactly the challenge credential IDs");
  }
  const refs = sortCredentialRefs(
    input.credentials.map((row, index) => ({
      id: asUuid(row.id, `credentials[${index}].id`),
      hash: asHash(row.hash, `credentials[${index}].hash`),
    })),
  );
  if (refs.map((row) => row.id).join("\n") !== challenge.credentialIds.join("\n")) {
    fail("malformed", "credential IDs must match the challenge set");
  }
  const hashes = new Set(refs.map((row) => row.hash));
  if (hashes.size !== refs.length) fail("malformed", "credential hashes must be unique");

  return {
    protocol: SSI_PRESENT_PROTOCOL,
    purpose: SSI_PRESENT_PURPOSE,
    challengeId: challenge.challengeId,
    nonce: challenge.nonce,
    audience: challenge.audience,
    holderDid,
    credentials: refs,
    issuedAt: challenge.issuedAt,
    expiresAt: challenge.expiresAt,
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

export function presentationSignBytes(claims: PresentationSigningClaims): Buffer {
  return Buffer.from(canonicalPresentationPayload(claims), "utf8");
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function assertUnsignedDocument(document: unknown): CredentialDocument {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    fail("malformed", "credential document must be an object");
  }
  const record = document as Record<string, unknown>;
  if ("proof" in record) fail("malformed", "unsigned credential document must not include proof");
  if (typeof record.id !== "string" || record.id.length === 0) {
    fail("malformed", "credential document id is required");
  }
  const subject = record.credentialSubject;
  if (!subject || typeof subject !== "object" || Array.isArray(subject)) {
    fail("malformed", "credentialSubject is required");
  }
  return cloneJson(document) as CredentialDocument;
}

function cloneIssuerProof(proof: IssuerCredentialProof): IssuerCredentialProof {
  const copied = cloneJson(proof);
  if (copied.type !== ISSUER_PROOF_TYPE) {
    fail("malformed", `issuer proof type must remain ${ISSUER_PROOF_TYPE}`);
  }
  if (copied.cryptosuite !== ISSUER_CRYPTOSUITE) {
    fail("malformed", `issuer proof cryptosuite must remain ${ISSUER_CRYPTOSUITE}`);
  }
  if (typeof copied.proofValue !== "string" || !isCanonicalEd25519ProofValue(copied.proofValue)) {
    fail("malformed", "issuer proofValue must be a canonical 64-byte Ed25519 signature");
  }
  return copied;
}

function unsignedFromEmbedded(credential: EmbeddedVerifiableCredential): CredentialDocument {
  const { proof: _proof, ...document } = credential;
  return assertUnsignedDocument(document);
}

export function buildPresentationEnvelope(input: {
  claims: PresentationSigningClaims;
  credentials: Array<{
    id: string;
    document: CredentialDocument;
    proof: IssuerCredentialProof;
  }>;
  proofValue: string;
}): SijilVerifiablePresentation {
  const claims = buildPresentationSigningClaims(input.claims);
  if (!isCanonicalEd25519ProofValue(input.proofValue)) {
    fail("malformed", "learner proofValue must be a canonical 64-byte Ed25519 signature");
  }
  if (input.credentials.length !== claims.credentials.length) {
    fail("malformed", "envelope credentials must match signing claims");
  }

  const byId = new Map(input.credentials.map((row) => [asUuid(row.id, "credential.id"), row]));
  const verifiableCredential: EmbeddedVerifiableCredential[] = [];
  const sijilCredentialIds: string[] = [];

  for (const ref of claims.credentials) {
    const row = byId.get(ref.id);
    if (!row) fail("credential_mismatch", `missing issued credential ${ref.id}`);
    const document = assertUnsignedDocument(row.document);
    const hash = hashUnsignedCredentialDocument(document);
    if (hash !== ref.hash) {
      fail("credential_mismatch", `credential ${ref.id} hash does not match the signed claims`);
    }
    const subjectId = document.credentialSubject.id;
    if (subjectId !== claims.holderDid) {
      fail("holder_mismatch", "credentialSubject.id must match the presentation holder DID");
    }
    verifiableCredential.push({
      ...document,
      proof: cloneIssuerProof(row.proof),
    });
    sijilCredentialIds.push(ref.id);
  }

  const binding = canonicalSsiBindingFromDid(claims.holderDid);
  return {
    "@context": [SSI_PRESENT_CONTEXT],
    type: ["VerifiablePresentation"],
    holder: claims.holderDid,
    verifiableCredential,
    sijilCredentialIds,
    proof: {
      type: SSI_PRESENT_PROOF_TYPE,
      cryptosuite: SSI_PRESENT_CRYPTOSUITE,
      created: claims.issuedAt,
      expires: claims.expiresAt,
      verificationMethod: binding.verificationMethod,
      proofPurpose: SSI_PRESENT_PROOF_PURPOSE,
      challenge: claims.challengeId,
      nonce: claims.nonce,
      domain: claims.audience,
      protocol: SSI_PRESENT_PROTOCOL,
      proofValue: input.proofValue,
    },
  };
}

export function rebuildPresentationSigningClaims(
  envelope: SijilVerifiablePresentation,
): PresentationSigningClaims {
  if (envelope?.type?.[0] !== "VerifiablePresentation") {
    fail("malformed", "type must be VerifiablePresentation");
  }
  if (envelope["@context"]?.[0] !== SSI_PRESENT_CONTEXT) {
    fail("malformed", "presentation @context is not credentials/v2");
  }
  const proof = envelope.proof;
  if (!proof || typeof proof !== "object") fail("malformed", "presentation proof is required");
  if (proof.type !== SSI_PRESENT_PROOF_TYPE) fail("malformed", "learner proof type is invalid");
  if (proof.cryptosuite !== SSI_PRESENT_CRYPTOSUITE) {
    fail("malformed", "learner proof must use sijil-ed25519-jcs-utf8-2026, not eddsa-jcs-2022");
  }
  if (proof.proofPurpose !== SSI_PRESENT_PROOF_PURPOSE) {
    fail("malformed", "learner proofPurpose must be authentication");
  }
  if (proof.protocol !== SSI_PRESENT_PROTOCOL) fail("malformed", "learner proof protocol is invalid");

  const credentials = envelope.verifiableCredential;
  const ids = envelope.sijilCredentialIds;
  if (!Array.isArray(credentials) || !Array.isArray(ids) || credentials.length === 0) {
    fail("malformed", "presentation must include credentials and sijilCredentialIds");
  }
  if (credentials.length !== ids.length) {
    fail("malformed", "sijilCredentialIds length must match verifiableCredential");
  }

  return buildPresentationSigningClaims({
    challengeId: proof.challenge,
    nonce: proof.nonce,
    audience: proof.domain,
    holderDid: envelope.holder,
    issuedAt: proof.created,
    expiresAt: proof.expires,
    credentials: credentials.map((credential, index) => ({
      id: ids[index],
      hash: hashUnsignedCredentialDocument(unsignedFromEmbedded(credential)),
    })),
  });
}

function holderMatchesEnvelope(envelope: SijilVerifiablePresentation, claims: PresentationSigningClaims): boolean {
  if (envelope.holder !== claims.holderDid) return false;
  const expectedVm = canonicalSsiBindingFromDid(claims.holderDid).verificationMethod;
  if (envelope.proof.verificationMethod !== expectedVm) return false;
  return envelope.verifiableCredential.every((credential) => {
    return unsignedFromEmbedded(credential).credentialSubject.id === claims.holderDid;
  });
}

export function verifyPresentationProof(
  envelope: SijilVerifiablePresentation,
  now: Date = new Date(),
): PresentationVerifyResult {
  try {
    const claims = rebuildPresentationSigningClaims(envelope);
    if (!holderMatchesEnvelope(envelope, claims)) {
      return { ok: false, reason: "holder_mismatch", message: "presentation holder does not match credential subject DID" };
    }
    if (now.getTime() >= Date.parse(claims.expiresAt)) {
      return { ok: false, reason: "expired", message: "presentation challenge has expired" };
    }
    const payload = presentationSignBytes(claims);
    const binding = canonicalSsiBindingFromDid(claims.holderDid);
    if (!verifyEd25519Utf8(binding.publicKey, payload, envelope.proof.proofValue)) {
      return { ok: false, reason: "invalid_signature", message: "learner Ed25519 signature is invalid" };
    }
    return { ok: true, claims };
  } catch (err) {
    if (err instanceof PresentationProtocolError) {
      return { ok: false, reason: err.reason, message: err.message };
    }
    return { ok: false, reason: "malformed", message: err instanceof Error ? err.message : "malformed presentation" };
  }
}
