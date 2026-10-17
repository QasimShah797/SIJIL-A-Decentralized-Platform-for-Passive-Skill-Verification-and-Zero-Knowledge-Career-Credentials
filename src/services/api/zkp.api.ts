/**
 * Owner-only witness fetch. This is not the recruiter verification API.
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
