/**
 * Owner-only witness fetch (legacy) and automated assessment policy APIs.
 * Status responses never include private score/blinding.
 */
import { apiRequest } from "./client";

export interface ZkpWitnessResponse {
  circuitId: "score-threshold-v1";
  credentialId: string;
  commitment: string;
  witness: {
    score: string;
    blinding: string;
    learnerId: string;
    attemptId: string;
  };
  artifactHashes: {
    wasm: string;
    zkey: string;
    verificationKey: string;
  };
}

export function getZkpWitness(credentialId: string): Promise<ZkpWitnessResponse> {
  return apiRequest<ZkpWitnessResponse>(`/zkp/witness/${encodeURIComponent(credentialId)}`, {
    cache: "no-store",
    headers: { "Cache-Control": "no-store" },
  });
}

export interface ReusableScoreProofResult {
  proofBinding: "reusable-credential-bound-v1";
  circuitId: "score-threshold-v1";
  credentialId: string;
  threshold: string | null;
  verified: boolean;
  message: string;
  replay: string;
  policyOutcome?: string | null;
  policyThreshold?: number | null;
  policyVariant?: string | null;
  checks: {
    signature: string;
    documentHash: string;
    credentialRevoked: boolean | string;
    circuit: string;
    commitment: string;
    proof: string;
    verificationKey: string;
    fabric: string;
  };
}

export function verifyReusableScoreProof(
  shareToken: string,
  body: { circuitId: string; proof: unknown; publicSignals: string[] },
): Promise<ReusableScoreProofResult> {
  return apiRequest<ReusableScoreProofResult>(
    `/public/presentations/${encodeURIComponent(shareToken)}/zkp/verify`,
    {
      method: "POST",
      body: JSON.stringify(body),
      cache: "no-store",
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export interface ZkpPolicyStatusItem {
  zkpType: string;
  policyVersion: string;
  threshold: number;
  outcome: string;
  circuitVariant: string | null;
  commitment: string | null;
  evidenceRef: string;
  evidenceScope: Record<string, unknown>;
  evidenceFreshAt: string | null;
  errorCode: string | null;
  updatedAt: string;
  hasDisclosure: boolean;
}

export interface ZkpStatusResponse {
  available: boolean;
  reason?: string;
  assessment: ZkpPolicyStatusItem[];
  github: ZkpPolicyStatusItem[];
  policy: {
    assessmentThreshold: number;
    githubThreshold: number;
  };
}

/** With a competencyId, the backend returns only outcomes linked to that owned competency. */
export function getZkpStatus(competencyId?: string): Promise<ZkpStatusResponse> {
  const query = competencyId ? `?competencyId=${encodeURIComponent(competencyId)}` : "";
  return apiRequest<ZkpStatusResponse>(`/zkp/status${query}`, {
    cache: "no-store",
    headers: { "Cache-Control": "no-store" },
  });
}

export interface PolicyVerifyResponse {
  outcome: string;
  threshold: number;
  zkpType: string;
  policyVersion?: string;
  circuitVariant: string | null;
  scope: Record<string, unknown> | null;
  evidenceFreshAt: string | null;
  evidenceRef?: string;
  errorCode?: string | null;
  check?: string;
  message: string;
}

export function verifyAssessmentPolicy(disclosureToken: string): Promise<PolicyVerifyResponse> {
  return apiRequest<PolicyVerifyResponse>("/recruiter/zkp/policy/verify", {
    method: "POST",
    body: JSON.stringify({ disclosureToken }),
  });
}

/** Policy outcome for a selective-share link; the server re-verifies the stored proof. */
export function getSharedAssessmentPolicy(shareToken: string): Promise<PolicyVerifyResponse> {
  return apiRequest<PolicyVerifyResponse>(`/public/presentations/${encodeURIComponent(shareToken)}/zkp/policy`, {
    cache: "no-store",
    headers: { "Cache-Control": "no-store" },
  });
}
