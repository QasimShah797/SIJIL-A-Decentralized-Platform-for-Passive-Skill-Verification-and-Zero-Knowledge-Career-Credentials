/**
 * Peer review HTTP handlers — projects, contributors, invites, submit, stats.
 */
import { Request, Response } from "express";
import { peerReviewService } from "../services/peer-review.service";
import { sendSuccess } from "../utils/apiResponse";
import { paramString } from "../utils/params";
import {
  createPeerReviewInviteSchema,
  submitPeerReviewSchema,
} from "../validators/peer-review.validator";

export async function getPeerReviewProjects(req: Request, res: Response): Promise<Response> {
  const projects = await peerReviewService.getProjects(req.user!.id);
  return sendSuccess(res, projects);
}

export async function getPeerReviewContributors(req: Request, res: Response): Promise<Response> {
  const projectId = paramString(req.params.id, "id");
  const contributors = await peerReviewService.getProjectContributors(req.user!.id, projectId);
  return sendSuccess(res, contributors);
}

export async function createPeerReviewInvite(req: Request, res: Response): Promise<Response> {
  const input = createPeerReviewInviteSchema.parse(req.body);
  const result = await peerReviewService.createInvite(req.user!.id, input);
  const message = result.alreadyReviewed
    ? "Contributor already has a review for this project"
    : result.status === "resent"
      ? "Review invite resent by email"
      : result.status === "already_invited"
        ? "Review invite already pending"
        : "Review invitation created";
  return sendSuccess(res, result, message, result.alreadyReviewed ? 200 : 201);
}

export async function submitPeerReview(req: Request, res: Response): Promise<Response> {
  const input = submitPeerReviewSchema.parse(req.body);
  const review = await peerReviewService.submitReview(input);
  return sendSuccess(res, review, "Evidence-based peer review submitted");
}

export async function getPeerReviewStats(req: Request, res: Response): Promise<Response> {
  const stats = await peerReviewService.getStats(req.user!.id);
  return sendSuccess(res, stats);
}

export async function getPeerReviewInviteByToken(req: Request, res: Response): Promise<Response> {
  const token = paramString(req.params.token, "token");
  const form = await peerReviewService.getInviteByToken(token);
  return sendSuccess(res, form);
}

export async function getPeerReviews(req: Request, res: Response): Promise<Response> {
  const reviews = await peerReviewService.getReviewsForUser(req.user!.id);
  return sendSuccess(res, reviews);
}
