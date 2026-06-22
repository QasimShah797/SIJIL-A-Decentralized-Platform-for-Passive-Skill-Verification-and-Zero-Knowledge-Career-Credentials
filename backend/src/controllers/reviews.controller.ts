/**
 * Context review HTTP handlers.
 */
import { Request, Response } from "express";
import { reviewsService } from "../services/reviews.service";
import { sendSuccess } from "../utils/apiResponse";
import { paramString } from "../utils/params";
import {
  createReviewRequestSchema,
  importExternalSchema,
  submitContextReviewSchema,
} from "../validators/reviews.validator";

export async function importExternalReviews(req: Request, res: Response): Promise<Response> {
  const body = importExternalSchema.parse(req.body ?? {});
  if (body.projectId) {
    const result = await reviewsService.importExternalForProject(req.user!.id, body.projectId);
    return sendSuccess(res, result, "External reviews imported");
  }
  if (body.evidenceId) {
    const result = await reviewsService.importExternalForEvidence(req.user!.id, body.evidenceId);
    return sendSuccess(res, result, "External reviews imported");
  }
  const results = await reviewsService.importExternalForUser(req.user!.id);
  return sendSuccess(res, results, "External reviews imported");
}

export async function getEvidenceReviews(req: Request, res: Response): Promise<Response> {
  const evidenceId = paramString(req.params.evidenceId, "evidenceId");
  const summary = await reviewsService.getEvidenceReviewSummary(req.user!.id, evidenceId);
  return sendSuccess(res, summary);
}

export async function getEligibleReviewers(req: Request, res: Response): Promise<Response> {
  const evidenceId = paramString(req.params.evidenceId, "evidenceId");
  const reviewers = await reviewsService.getEligibleReviewers(req.user!.id, evidenceId);
  return sendSuccess(res, reviewers);
}

export async function createReviewRequest(req: Request, res: Response): Promise<Response> {
  const input = createReviewRequestSchema.parse(req.body);
  const result = await reviewsService.createReviewRequest(req.user!.id, input);
  return sendSuccess(res, result, "Review request sent", 201);
}

export async function getReviewRequestByToken(req: Request, res: Response): Promise<Response> {
  const token = paramString(req.params.token, "token");
  const form = await reviewsService.getReviewRequestByToken(token);
  return sendSuccess(res, form);
}

export async function submitReviewByToken(req: Request, res: Response): Promise<Response> {
  const token = paramString(req.params.token, "token");
  const input = submitContextReviewSchema.parse(req.body);
  const review = await reviewsService.submitReviewByToken(token, input);
  return sendSuccess(res, review, "Context verified review submitted");
}
