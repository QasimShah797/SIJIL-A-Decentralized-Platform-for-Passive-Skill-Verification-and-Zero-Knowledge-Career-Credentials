import { z } from "zod";
import {
  CONTEXT_RECOMMENDATION,
} from "../constants/reviews";
import {
  PEER_REVIEW_RECOMMENDATION,
} from "../constants/peer-review";

export const createPeerReviewInviteSchema = z.object({
  projectId: z.string().min(1),
  contributorId: z.string().min(1),
  skillId: z.string().uuid(),
  contributorEmail: z.string().email(),
  resend: z.boolean().optional(),
});

/** Alternate invite payload used by some clients. */
export const alternatePeerReviewInviteSchema = z.object({
  reviewer_email: z.string().email(),
  github_username: z.string().min(1),
  skill_id: z.string().uuid(),
  competency: z.string().min(1),
  repository: z.string().min(1),
});

export const submitPeerReviewSchema = z.object({
  token: z.string().min(16),
  rating: z.number().int().min(1).max(5),
  feedback: z.string().min(1).max(5000),
  recommendation: z.enum([
    CONTEXT_RECOMMENDATION.SUPPORT,
    CONTEXT_RECOMMENDATION.NEEDS_MORE,
    CONTEXT_RECOMMENDATION.NOT_ENOUGH,
    PEER_REVIEW_RECOMMENDATION.RECOMMENDED,
    PEER_REVIEW_RECOMMENDATION.NEEDS_MORE,
    PEER_REVIEW_RECOMMENDATION.CANNOT_CONFIRM,
  ]),
  reviewerEmail: z.string().email().optional(),
  reviewerGithubUsername: z.string().min(1).max(80).optional(),
}).refine((value) => Boolean(value.reviewerEmail?.trim() || value.reviewerGithubUsername?.trim()), {
  message: "Enter your invited email or GitHub username to verify your identity",
});
