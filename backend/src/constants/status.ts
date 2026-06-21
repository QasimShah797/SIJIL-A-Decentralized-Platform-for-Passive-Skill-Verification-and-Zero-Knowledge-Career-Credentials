/**
 * Shared status constants for skills, evidence, attestations, and credentials.
 */
export const SKILL_STATUS = {
  CLAIMED: "Skill Claimed",
  EVIDENCE_LINKED: "Evidence Linked",
  WALLET_READY: "Wallet Ready",
  CREDENTIAL_ISSUED: "Credential Issued",
} as const;

export const PIPELINE_STAGE = {
  DECLARED: "declared",
  EVIDENCE_LINKED: "evidence_linked",
  INSTITUTION_PENDING: "institution_attestation_pending",
  INSTITUTION_REJECTED: "institution_attestation_rejected",
  WALLET_READY: "wallet_ready",
  IN_WALLET: "in_wallet",
} as const;

export const ATTESTATION_STATUS = {
  PENDING: "Pending Attestation",
  APPROVED: "Attestation Approved",
  REJECTED: "Attestation Rejected",
  CLARIFICATION: "Needs Clarification",
} as const;

export const EVIDENCE_STATUS = {
  PENDING: "Pending",
  REVIEWED: "Reviewed",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
} as const;

export const CREDENTIAL_VERIFICATION = {
  PENDING: "Pending",
  VERIFIED: "Verified",
} as const;
