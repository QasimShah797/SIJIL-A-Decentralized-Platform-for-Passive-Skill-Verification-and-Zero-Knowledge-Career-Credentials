/**
 * Context review API — evidence review status, requests, and token form.
 */
import { tryApiRequest, apiRequest, isApiEnabled } from "./client";

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
  expiresAt: string;
}

export type ContextRecommendation = "Support" | "Needs More Evidence" | "Not Enough Context";

export async function importExternalReviewsApi(
  input?: {
    evidenceId?: string;
    projectId?: string;
  },
  onError?: (message: string) => void,
): Promise<{ imported?: number; evidenceId?: string; projectId?: string } | null> {
  return tryApiRequest("/reviews/import-external", {
    method: "POST",
    body: JSON.stringify(input ?? {}),
  }, onError);
}

export async function getEvidenceReviewsApi(
  evidenceId: string,
): Promise<EvidenceReviewSummary | null> {
  return tryApiRequest<EvidenceReviewSummary>(`/reviews/evidence/${evidenceId}`);
}

export async function getEligibleReviewersApi(
  evidenceId: string,
): Promise<EligibleReviewerView[] | null> {
  return tryApiRequest<EligibleReviewerView[]>(`/reviews/eligible-reviewers/${evidenceId}`);
}

export async function createReviewRequestApi(input: {
  evidenceId: string;
  skillId: string;
  reviewerContextId: string;
  reviewerEmail: string;
}): Promise<{ requestId: string; token: string; reviewLink: string; status: string } | null> {
  return tryApiRequest("/reviews/request", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getReviewRequestByTokenApi(
  token: string,
): Promise<ReviewRequestFormView> {
  return apiRequest<ReviewRequestFormView>(`/reviews/request/${token}`);
}

export async function submitContextReviewApi(
  token: string,
  body: { rating: number; feedback: string; recommendation: ContextRecommendation },
): Promise<ContextReviewView> {
  return apiRequest<ContextReviewView>(`/reviews/submit/${token}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function canRequestContextReview(summary: EvidenceReviewSummary | null): boolean {
  if (!summary) return false;
  return summary.displayStatus === "No External Review Found";
}

export { isApiEnabled };
