/**
 * Server-attested selective-disclosure presentation proofs.
 *
 * The proof binds the frozen payload hash to learner/competency identity and
 * share lifetime. Timestamps MUST be canonicalized before HMAC so Postgres
 * timestamptz round-trips (`Z` vs `+00:00`) cannot invalidate an untampered proof.
 */
import { createHmac } from "node:crypto";
import { env } from "../config/env";
import { canonicalizeJson } from "../utils/canonicalize";
import { generateSha256Hash } from "../utils/generateHash";

export interface ProofPayload {
  type: string;
  cryptosuite: string;
  created: string;
  verificationMethod: string;
  proofValue: string;
  proofPurpose: string;
}

export interface SelectiveDisclosureProof extends ProofPayload {
  type: "SignedVerifiablePresentation";
  cryptosuite: "hmac-sha256-2026";
}

function presentationSigningSecret(): string {
  return env.PRESENTATION_SIGNING_SECRET;
}

/** Normalize timestamptz strings to ISO-8601 UTC with `Z` for stable HMAC input. */
export function canonicalProofTimestamp(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    throw new Error("Invalid presentation timestamp");
  }
  return new Date(ms).toISOString();
}

export function hashDisclosurePayload(payload: unknown): string {
  return generateSha256Hash(canonicalizeJson(payload));
}

export function buildSelectiveDisclosureProof(params: {
  learnerDid: string | null;
  competencyId: string;
  learnerId: string;
  payloadHash: string;
  createdAt: string;
  expiresAt: string | null;
}): SelectiveDisclosureProof {
  const createdAt = canonicalProofTimestamp(params.createdAt);
  if (!createdAt) {
    throw new Error("Presentation createdAt is required");
  }
  const expiresAt = canonicalProofTimestamp(params.expiresAt);
  // Use the same DID string in the signed material and verificationMethod so
  // verify (which recovers DID from verification_method) cannot diverge when
  // learnerDid was null at sign time.
  const learnerDid = params.learnerDid ?? `did:sijil:learner:${params.learnerId}`;

  const proofMaterial = canonicalizeJson({
    learnerDid,
    competencyId: params.competencyId,
    learnerId: params.learnerId,
    payloadHash: params.payloadHash,
    createdAt,
    expiresAt,
  });

  const proofValue = createHmac("sha256", presentationSigningSecret())
    .update(proofMaterial)
    .digest("hex");

  return {
    type: "SignedVerifiablePresentation",
    cryptosuite: "hmac-sha256-2026",
    created: createdAt,
    verificationMethod: `${learnerDid}#wallet-key-1`,
    proofValue: `0x${proofValue}`,
    proofPurpose: "assertionMethod",
  };
}

export function verifySelectiveDisclosureProof(params: {
  learnerDid: string | null;
  competencyId: string;
  learnerId: string;
  payloadHash: string;
  createdAt: string;
  expiresAt: string | null;
  proof: Pick<SelectiveDisclosureProof, "proofValue">;
}): boolean {
  try {
    const expected = buildSelectiveDisclosureProof({
      learnerDid: params.learnerDid,
      competencyId: params.competencyId,
      learnerId: params.learnerId,
      payloadHash: params.payloadHash,
      createdAt: params.createdAt,
      expiresAt: params.expiresAt,
    });
    return expected.proofValue === params.proof.proofValue;
  } catch {
    return false;
  }
}
