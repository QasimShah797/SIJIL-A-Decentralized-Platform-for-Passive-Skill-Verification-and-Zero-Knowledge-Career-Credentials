import type { Relationship } from "../constants/peer-review";

export interface PeerReviewProjectView {
  id: string;
  name: string;
  source: "GitHub" | "LMS" | "Spark" | "Manual Project";
  url?: string;
  evidenceLabel: string;
  linkedSkills: string[];
  contributors: PeerReviewContributorView[];
  evidenceRecordId?: string;
  skillLinks: { skillId: string; skillName: string }[];
}

export interface PeerReviewContributorView {
  id: string;
  name: string;
  handle?: string;
  email?: string;
  role: string;
  relationship: Relationship;
  avatarUrl?: string;
  verified: boolean;
  reviewStatus: "Imported Review Found" | "Review Received" | "Invite Sent" | "Review Pending";
  reviewId?: string;
  inviteId?: string;
}

export interface PeerReviewStatsView {
  totalReviews: number;
  contextVerified: number;
  imported: number;
  fromSIJILForm: number;
  highTrust: number;
  pendingInvites: number;
}

export interface PeerReviewRecordView {
  id: string;
  reviewerName: string;
  reviewerRole: string;
  source: string;
  origin: string;
  skill: string;
  skillId?: string | null;
  projectId?: string;
  projectName?: string;
  evidenceLabel: string;
  evidenceUrl?: string;
  rating: number;
  comment: string;
  recommendation?: string;
  date: string;
  contextStatus: string;
  contributorVerification?: string;
  trustWeight: string;
  trustWeightScore: number;
  relationship: Relationship;
  imported: boolean;
}

export interface CreatePeerReviewInviteInput {
  projectId: string;
  contributorId: string;
  skillId: string;
  contributorEmail: string;
  resend?: boolean;
}

export interface SubmitPeerReviewInput {
  token: string;
  rating: number;
  feedback: string;
  recommendation: string;
  reviewerEmail?: string;
  reviewerGithubUsername?: string;
}

export interface PeerReviewInviteFormView {
  token: string;
  status: string;
  learnerName: string;
  skillClaim: string;
  evidenceName: string;
  contextSource: string;
  reviewerContext: string;
  reviewerName: string;
  expiresAt: string;
}

export interface PeerReviewInviteResult {
  inviteId: string;
  token: string;
  reviewLink: string;
  status: string;
  importedReviewId?: string;
  alreadyReviewed?: boolean;
}
