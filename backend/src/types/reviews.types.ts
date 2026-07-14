import type {
  ContextRecommendation,
} from "../constants/reviews";

export interface ContextReviewView {
  id: string;
  reviewType: string;
  reviewerName: string;
  reviewerRole: string;
  source: string;
  skillName: string;
  rating: number;
  comment: string;
  recommendation: string | null;
  externalReference: string | null;
  reviewDate: string;
}

export interface EvidenceReviewSummary {
  evidenceId: string;
  displayStatus: string;
  reviews: ContextReviewView[];
  pendingRequest: {
    id: string;
    status: string;
    reviewerName: string;
    reviewerEmail: string;
    sentAt: string;
  } | null;
}

export interface EligibleReviewerView {
  id: string;
  name: string;
  email: string | null;
  login: string | null;
  contextRole: string;
  source: string;
}

export interface ReviewRequestFormView {
  token: string;
  status: string;
  learnerName: string;
  skillClaim: string;
  evidenceName: string;
  contextSource: string;
  reviewerContext: string;
  reviewerName: string;
  invitedReviewerEmail?: string | null;
  invitedGithubLogin?: string | null;
  expiresAt: string;
}

export interface CreateReviewRequestInput {
  evidenceId: string;
  skillId: string;
  reviewerContextId: string;
  reviewerEmail: string;
}

export interface SubmitContextReviewInput {
  rating: number;
  feedback: string;
  recommendation: ContextRecommendation;
  reviewerEmail?: string;
  reviewerGithubUsername?: string;
}

export interface ImportExternalResult {
  evidenceId: string;
  projectId?: string;
  imported: number;
}
