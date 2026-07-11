export const WALLET_SOURCE_BADGES = [
  "GitHub",
  "LMS",
  "Practical Task",
  "Reviews",
] as const;

export type WalletSourceBadge = (typeof WALLET_SOURCE_BADGES)[number];

export const WALLET_RECORD_STATUSES = [
  "Evidence Collected",
  "Task Submitted",
  "Passed",
  "Needs Improvement",
  "Review Available",
] as const;

export type WalletRecordStatus = (typeof WALLET_RECORD_STATUSES)[number];

export type WalletPracticalTaskStatus =
  | "Task Submitted"
  | "Passed"
  | "Needs Improvement";

export const WALLET_SHARE_FIELD_IDS = [
  "competency_name",
  "competency_domain",
  "competency_description",
  "verification_status",
  "practical_task_result",
  "github_evidence",
  "lms_evidence",
  "peer_reviews",
  "teacher_feedback",
  "complete_evidence_package",
  "learner_did",
  "timestamps",
  "credential_metadata",
] as const;

export type WalletShareFieldId = (typeof WALLET_SHARE_FIELD_IDS)[number];

export type WalletShareSelectionMode =
  | "basic_summary"
  | "verification_summary"
  | "complete_evidence_package"
  | "custom";

export interface WalletAttemptHistoryItem {
  attemptId: string;
  title: string;
  status: WalletPracticalTaskStatus;
  submittedAt: string | null;
  scorePercent: number | null;
  correctCount: number | null;
  totalQuestions: number | null;
  passed: boolean;
}

export interface WalletEvidenceSummary {
  competency: {
    id: string;
    name: string;
    domain: string;
    description: string;
  };
  learner: {
    id: string;
    did: string | null;
    identityReference: string | null;
  };
  github: {
    repos: Record<string, unknown>[];
    activities: Record<string, unknown>[];
    evidenceRecords: Record<string, unknown>[];
    reviews: Record<string, unknown>[];
  };
  lms: {
    evidence: Record<string, unknown>[];
    courses: Record<string, unknown>[];
    assignments: Record<string, unknown>[];
    grades: Record<string, unknown>[];
    importedEvidence: Record<string, unknown>[];
  };
  practicalTask: {
    latestAttempt: WalletAttemptHistoryItem | null;
    attemptHistory: WalletAttemptHistoryItem[];
  };
  peerReviews: Record<string, unknown>[];
  teacherFeedback: Record<string, unknown>[];
  externalEvidence: Record<string, unknown>[];
  institutionReview: {
    status: string | null;
    feedback: string | null;
    reviewedAt: string | null;
  };
  credentialMetadata: Record<string, unknown>[];
  evidenceTimestamps: {
    github: string[];
    lms: string[];
    practicalTask: string[];
    peerReviews: string[];
    teacherFeedback: string[];
    externalEvidence: string[];
  };
  sourceBadges: WalletSourceBadge[];
  evidenceCount: number;
  status: {
    taskStatus: WalletPracticalTaskStatus | null;
    reviewStatus: string;
    verificationStatus: string;
    walletStatus: WalletRecordStatus;
  };
  metadata: {
    createdAt: string;
    updatedAt: string;
    evidenceCount: number;
    sourceMetadata: string[];
    evidenceHashes: string[];
  };
}

export interface WalletCompetencyRecordView {
  id: string;
  learnerId: string;
  competencyId: string;
  competencyName: string;
  domain: string;
  description: string;
  learnerDid: string | null;
  learnerIdentityReference: string | null;
  status: WalletRecordStatus | string;
  practicalTaskStatus: WalletPracticalTaskStatus | string | null;
  taskResult: WalletPracticalTaskStatus | string | null;
  verificationStatus: string;
  walletRecordStatus: string;
  evidenceCount: number;
  sourceBadges: WalletSourceBadge[];
  createdAt: string;
  updatedAt: string;
  evidencePackage: WalletEvidenceSummary;
}

export interface WalletShareRecordView {
  id: string;
  competencyId: string;
  selectedFields: WalletShareFieldId[];
  selectionMode: WalletShareSelectionMode;
  proofType: string;
  shareStatus: "Active" | "Expired" | "Revoked";
  tokenHint: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface WalletCompetencyDetailView {
  record: WalletCompetencyRecordView;
  shares: WalletShareRecordView[];
}

export interface ShareWalletCompetencyInput {
  selectionMode: WalletShareSelectionMode;
  selectedFields: WalletShareFieldId[];
  expiresInDays?: number;
}

export interface ShareWalletCompetencyResult {
  shareId: string;
  shareUrl: string;
  token: string;
  tokenHint: string;
  proofType: string;
  expiresAt: string | null;
}

export interface PublicPresentationVerification {
  tokenValid: boolean;
  expired: boolean;
  revoked: boolean;
  payloadHashMatches: boolean;
  proofValid: boolean;
  recordUnmodified: boolean;
  result: "Valid Proof" | "Expired" | "Revoked" | "Invalid/Tampered";
}

export interface PublicPresentationView {
  id: string;
  competencyId: string;
  selectedFields: WalletShareFieldId[];
  selectionMode: WalletShareSelectionMode;
  disclosedPayload: Record<string, unknown>;
  proofType: string;
  verificationMethod: string | null;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  payloadHash: string;
  proofValue: string | null;
  verification: PublicPresentationVerification;
}
