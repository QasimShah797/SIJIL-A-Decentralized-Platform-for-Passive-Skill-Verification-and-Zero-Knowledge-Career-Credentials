import { z } from "zod";
import { CONTEXT_RECOMMENDATION } from "../constants/reviews";

export const importExternalSchema = z.object({
  evidenceId: z.string().uuid().optional(),
});

export const createReviewRequestSchema = z.object({
  evidenceId: z.string().uuid(),
  skillId: z.string().uuid(),
  reviewerContextId: z.string().uuid(),
  reviewerEmail: z.string().email(),
});

export const submitContextReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  feedback: z.string().min(1).max(5000),
  recommendation: z.enum([
    CONTEXT_RECOMMENDATION.SUPPORT,
    CONTEXT_RECOMMENDATION.NEEDS_MORE,
    CONTEXT_RECOMMENDATION.NOT_ENOUGH,
  ]),
});
