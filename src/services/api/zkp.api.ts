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

export interface ScoreRequestSummary {
  id: string;
  credentialId: string;
  threshold: number;
  status: "open" | "declined" | "consumed" | "expired";
  expiresAt: string;
  createdAt: string;
  consumedAt: string | null;
}

export interface ScoreRequestDecision {
  accepted: boolean;
  threshold: number;
  credentialId: string;
  checks: {
    mathematics: string;
    signature: string;
    document: string;
    commitment: string;
    threshold: string;
    holder: string;
    revocation: string;
    ledger: string;
    request: string;
  };
  message: string;
  limitation: string;
}

export function listLearnerScoreRequests(): Promise<{ available: boolean; reason: string | null; requests: ScoreRequestSummary[] }> {
  return apiRequest("/zkp/requests", { cache: "no-store", headers: { "Cache-Control": "no-store" } });
}

export function declineScoreRequest(requestId: string): Promise<ScoreRequestSummary> {
  return apiRequest(`/zkp/requests/${encodeURIComponent(requestId)}/decline`, { method: "POST" });
}

export function submitScoreProof(
  requestId: string,
  body: { circuitId: "score-threshold-v1"; proof: unknown; publicSignals: string[] },
): Promise<ScoreRequestDecision> {
  return apiRequest(`/zkp/requests/${encodeURIComponent(requestId)}/proof`, {
    method: "POST",
    body: JSON.stringify(body),
    cache: "no-store",
    headers: { "Cache-Control": "no-store" },
  });
}

export function createScoreRequest(shareToken: string, threshold: number): Promise<ScoreRequestSummary>;
export function createScoreRequest(input: { presentationId: string; threshold: number }): Promise<ScoreRequestSummary>;
export function createScoreRequest(
  shareTokenOrInput: string | { presentationId: string; threshold: number },
  threshold?: number,
): Promise<ScoreRequestSummary> {
  const body = typeof shareTokenOrInput === "string"
    ? { shareToken: shareTokenOrInput, threshold }
    : { presentationId: shareTokenOrInput.presentationId, threshold: shareTokenOrInput.threshold };
  return apiRequest("/recruiter/zkp/requests", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getScoreRequest(requestId: string): Promise<{ request: ScoreRequestSummary; decision: ScoreRequestDecision | null }> {
  return apiRequest(`/recruiter/zkp/requests/${encodeURIComponent(requestId)}`, {
    cache: "no-store",
    headers: { "Cache-Control": "no-store" },
  });
}

export interface VerificationRequestView {
  id: string;
  legacyScoreRequestId: string | null;
  recruiterUserId: string;
  learnerUserId: string;
  recruiterLabel: string;
  learnerLabel: string;
  category: "practical-score" | "github-activity" | "moodle-performance" | "skill-progression";
  skillLabel: string;
  policyLabel: string;
  threshold: number | null;
  status: "pending" | "approved" | "generating" | "verified" | "unsatisfied" | "failed" | "rejected" | "expired" | "cancelled";
  expiresAt: string;
  createdAt: string;
}

export interface VerificationNotificationView {
  id: string;
  recipientUserId: string;
  requestId: string;
  audience: "learner" | "recruiter";
  kind: "request_created" | "approved" | "rejected" | "verified" | "expired" | "failed";
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export function listVerificationNotifications(role: "learner" | "recruiter"): Promise<{ available: boolean; notifications: VerificationNotificationView[] }> {
  const path = role === "learner" ? "/zkp/notifications" : "/recruiter/zkp/notifications";
  return apiRequest(path, { cache: "no-store", headers: { "Cache-Control": "no-store" } });
}

export function listVerificationRequests(role: "learner" | "recruiter"): Promise<{ available: boolean; requests: VerificationRequestView[] }> {
  const path = role === "learner" ? "/zkp/verification-requests" : "/recruiter/zkp/verification-requests";
  return apiRequest(path, { cache: "no-store", headers: { "Cache-Control": "no-store" } });
}

export function markVerificationNotificationRead(role: "learner" | "recruiter", notificationId: string): Promise<VerificationNotificationView> {
  const path = role === "learner"
    ? `/zkp/notifications/${encodeURIComponent(notificationId)}/read`
    : `/recruiter/zkp/notifications/${encodeURIComponent(notificationId)}/read`;
  return apiRequest(path, { method: "POST" });
}

export function approveVerificationRequest(requestId: string): Promise<VerificationRequestView> {
  return apiRequest(`/zkp/verification-requests/${encodeURIComponent(requestId)}/approve`, { method: "POST" });
}

export function createGithubActivityRequest(learnerUserId: string, threshold: 50 | 100 | 150): Promise<VerificationRequestView> {
  return apiRequest("/recruiter/zkp/github-requests", {
    method: "POST",
    body: JSON.stringify({ learnerUserId, threshold }),
  });
}

export function proveGithubActivityRequest(requestId: string, repositoryFullName: string): Promise<{ status: string; repositoryFullName: string }> {
  return apiRequest(`/zkp/verification-requests/${encodeURIComponent(requestId)}/github-proof`, {
    method: "POST",
    body: JSON.stringify({ repositoryFullName }),
  });
}

export function rejectVerificationRequest(requestId: string): Promise<VerificationRequestView> {
  return apiRequest(`/zkp/verification-requests/${encodeURIComponent(requestId)}/reject`, { method: "POST" });
}

/** Policy outcome for a selective-share link; the server re-verifies the stored proof. */
export function getSharedAssessmentPolicy(shareToken: string): Promise<PolicyVerifyResponse> {
  return apiRequest<PolicyVerifyResponse>(`/public/presentations/${encodeURIComponent(shareToken)}/zkp/policy`, {
    cache: "no-store",
    headers: { "Cache-Control": "no-store" },
  });
}
