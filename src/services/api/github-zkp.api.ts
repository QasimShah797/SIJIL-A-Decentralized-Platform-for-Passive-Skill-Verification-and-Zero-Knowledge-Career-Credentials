/**
 * Learner and recruiter calls for github-contributions-v1 policy evaluation.
 * Responses are public proof metadata. They do not include openings.
 */
import { apiRequest } from "./client";
import type { ZkpPolicyStatusItem, ZkpStatusResponse } from "./zkp.api";

export type { ZkpPolicyStatusItem };
export { getZkpStatus } from "./zkp.api";

export interface ZkpTypeSummary {
  id: string;
  status: string;
  claim: string;
  source: string;
  publicInputs: readonly string[];
  privateInputs: readonly string[];
  setup: string;
  evidenceKind?: string;
}

export interface GitHubSnapshotSummary {
  snapshotId: string;
  learnerId: string;
  githubUsername: string;
  repositoryFullName: string;
  verifiedAt: string;
  commitment: string;
}

export interface GitHubEvidenceResponse {
  github: {
    connected: boolean;
    username: string | null;
    evidenceKind: "unique_verified_commit_shas";
    eligibleSnapshots: GitHubSnapshotSummary[];
  };
}

export interface GitHubProofResponse {
  proofId: string;
  snapshotId: string;
  status: "ready";
  circuitId: "github-contributions-v1";
  evidenceKind: "unique_verified_commit_shas";
  threshold: string;
  commitment: string;
  repositoryFullName: string;
  githubUsername: string;
  verifiedAt: string;
  publicSignals: [string, string];
  proof: unknown;
  trust: {
    groth16: "valid";
    githubAuthenticity: "checked_when_the_snapshot_was_created";
    credentialIssuance: "not_part_of_this_proof";
    fabricAnchor: "not_part_of_this_proof";
  };
  replay: string;
}

export interface GitHubDisclosureResponse {
  disclosureToken: string;
  expiresAt: string;
  proofId: string;
  claim: string;
  circuitId: "github-contributions-v1";
}

export interface GitHubVerificationResponse {
  verified: boolean;
  circuitId: "github-contributions-v1";
  evidenceKind: "unique_verified_commit_shas";
  claim: string;
  threshold: string | null;
  commitment: string | null;
  repositoryFullName: string | null;
  githubUsername: string | null;
  verifiedAt: string | null;
  message: string;
  replay: string;
  policyOutcome?: string | null;
  policyThreshold?: number | null;
  policyVariant?: string | null;
  policyScope?: Record<string, unknown> | null;
  policyFreshAt?: string | null;
  checks: {
    proof: string;
    commitment: string;
    snapshotOwnership: string;
    githubAuthenticity: string;
    credentialIssuance: string;
    fabricAnchor: string;
  };
}

export interface GitHubPolicyVerifyResponse {
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

export function listZkpTypes(): Promise<{ types: ZkpTypeSummary[]; missingProductDecisions: string }> {
  return apiRequest("/zkp/types");
}

export function listGitHubEvidence(): Promise<GitHubEvidenceResponse> {
  return apiRequest("/zkp/github/evidence");
}

export function verifyGitHubDisclosure(disclosureToken: string): Promise<GitHubVerificationResponse> {
  return apiRequest("/recruiter/github-zkp/verify", {
    method: "POST",
    body: JSON.stringify({ disclosureToken }),
  });
}

export function verifyGitHubPolicy(disclosureToken: string): Promise<GitHubPolicyVerifyResponse> {
  return apiRequest("/recruiter/github-zkp/policy/verify", {
    method: "POST",
    body: JSON.stringify({ disclosureToken }),
  });
}

export type { ZkpStatusResponse };
