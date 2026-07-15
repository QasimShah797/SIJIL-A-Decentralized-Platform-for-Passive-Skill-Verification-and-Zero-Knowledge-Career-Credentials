/**
 * Peer review API — projects, contributors, invites, stats.
 */
import { tryApiRequest, apiRequest, isApiEnabled, ApiUnavailableError } from "./client";
import { createPeerReviewInviteLocal } from "@/lib/db/peer-review-page";
import type { PeerReview, ProjectContributor } from "@/lib/sijil-data";
import type { PeerReviewProject } from "@/lib/db/peer-review-page";

export interface PeerReviewStatsApi {
  totalReviews: number;
  contextVerified: number;
  imported: number;
  fromSIJILForm: number;
  highTrust: number;
  pendingInvites: number;
}

export interface PeerReviewContributorApi extends ProjectContributor {
  verified: boolean;
  reviewStatus: string;
  reviewId?: string;
  inviteId?: string;
}

function mapReview(row: Record<string, unknown>): PeerReview {
  return {
    id: row.id as string,
    reviewerName: row.reviewerName as string,
    reviewerRole: row.reviewerRole as PeerReview["reviewerRole"],
    source: row.source as PeerReview["source"],
    origin: row.origin as PeerReview["origin"],
    skill: row.skill as string,
    projectId: row.projectId as string | undefined,
    projectName: row.projectName as string | undefined,
    evidenceLabel: row.evidenceLabel as string,
    evidenceUrl: row.evidenceUrl as string | undefined,
    rating: row.rating as PeerReview["rating"],
    comment: row.comment as string,
    recommendation: row.recommendation as PeerReview["recommendation"],
    date: row.date as string,
    contextStatus: row.contextStatus as PeerReview["contextStatus"],
    contributorVerification: row.contributorVerification as PeerReview["contributorVerification"],
    trustWeight: row.trustWeight as PeerReview["trustWeight"],
    imported: row.imported as boolean,
  };
}

export async function getPeerReviewProjectsApi(): Promise<PeerReviewProject[] | null> {
  return tryApiRequest<PeerReviewProject[]>("/peer-review/projects");
}

export async function getPeerReviewContributorsApi(
  projectId: string,
): Promise<PeerReviewContributorApi[] | null> {
  return tryApiRequest<PeerReviewContributorApi[]>(`/peer-review/project/${encodeURIComponent(projectId)}/contributors`);
}

export async function createPeerReviewInviteApi(
  input: {
    projectId: string;
    contributorId: string;
    skillId: string;
    contributorEmail: string;
    resend?: boolean;
  },
  onError?: (message: string) => void,
): Promise<{
  inviteId: string;
  token: string;
  reviewLink: string;
  status: string;
  importedReviewId?: string;
  alreadyReviewed?: boolean;
} | null> {
  if (isApiEnabled()) {
    try {
      return await apiRequest("/peer-review/invite", {
        method: "POST",
        body: JSON.stringify(input),
      });
    } catch (err) {
      const local = await createPeerReviewInviteLocal(input);
      if (local) return local;
      if (onError && err instanceof Error) onError(err.message);
      return null;
    }
  }

  const local = await createPeerReviewInviteLocal(input);
  if (local) return local;

  if (onError) onError("Could not create review invitation");
  return null;
}

export async function submitPeerReviewApi(input: {
  token: string;
  rating: number;
  feedback: string;
  recommendation: string;
}): Promise<PeerReview> {
  const row = await apiRequest<Record<string, unknown>>("/peer-review/submit", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return mapReview(row);
}

export async function getPeerReviewStatsApi(): Promise<PeerReviewStatsApi | null> {
  return tryApiRequest<PeerReviewStatsApi>("/peer-review/stats");
}

export async function getPeerReviewInviteByTokenApi(
  token: string,
): Promise<Record<string, unknown> | null> {
  return tryApiRequest<Record<string, unknown>>(`/peer-review/invite/${encodeURIComponent(token)}`);
}

export async function getPeerReviewsApi(): Promise<PeerReview[] | null> {
  const rows = await tryApiRequest<Record<string, unknown>[]>("/peer-review/reviews");
  if (!rows) return null;
  return rows.map(mapReview);
}
