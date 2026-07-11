/**
 * Mock cryptographic proof generation for verifiable credentials.
 * Future: replace with real ZKP / blockchain anchoring.
 */
import { createHmac } from "node:crypto";
import { env } from "../config/env";
import { generateProofHash, generateSha256Hash } from "../utils/generateHash";

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

export function buildCredentialProof(params: {
  credentialUri: string;
  issuerDid: string;
  holderDid: string;
  skillName: string;
}): ProofPayload {
  const proofValue = generateProofHash({
    credentialUri: params.credentialUri,
    issuerDid: params.issuerDid,
    holderDid: params.holderDid,
    skillName: params.skillName,
  });

  return {
    type: "DataIntegrityProof",
    cryptosuite: "sha256-2024-mock",
    created: new Date().toISOString(),
    verificationMethod: `${params.issuerDid}#key-1`,
    proofValue: `0x${proofValue}`,
    proofPurpose: "assertionMethod",
  };
}

function canonicalizeJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeJson(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalizeJson(record[key])}`).join(",")}}`;
}

function presentationSigningSecret(): string {
  return env.PRESENTATION_SIGNING_SECRET ?? env.SUPABASE_SERVICE_ROLE_KEY;
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
  const proofMaterial = canonicalizeJson({
    learnerDid: params.learnerDid,
    competencyId: params.competencyId,
    learnerId: params.learnerId,
    payloadHash: params.payloadHash,
    createdAt: params.createdAt,
    expiresAt: params.expiresAt,
  });

  const proofValue = createHmac("sha256", presentationSigningSecret())
    .update(proofMaterial)
    .digest("hex");

  return {
    type: "SignedVerifiablePresentation",
    cryptosuite: "hmac-sha256-2026",
    created: params.createdAt,
    verificationMethod: `${params.learnerDid ?? `did:sijil:learner:${params.learnerId}`}#wallet-key-1`,
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
  const expected = buildSelectiveDisclosureProof({
    learnerDid: params.learnerDid,
    competencyId: params.competencyId,
    learnerId: params.learnerId,
    payloadHash: params.payloadHash,
    createdAt: params.createdAt,
    expiresAt: params.expiresAt,
  });

  return expected.proofValue === params.proof.proofValue;
}
