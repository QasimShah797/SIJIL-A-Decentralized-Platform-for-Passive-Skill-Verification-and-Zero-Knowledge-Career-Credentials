/**
 * Learner and recruiter notification reads.
 * Writes stay on the service role. Responses contain no private marks or witnesses.
 */
import { Request, Response } from "express";
import { z } from "zod";
import { sendSuccess } from "../utils/apiResponse";
import { paramString } from "../utils/params";
import { AppError } from "../utils/AppError";
import { isMissingRelationError } from "../utils/supabase-errors";
import { createVerificationWorkflow, verificationPartyLabels, verificationStorageAvailable } from "../services/zkp-notification.store";
import { createSupabaseScoreRequestStore } from "../services/zkp-score-request.store";
import { fulfillGithubActivityRequest } from "../services/github-activity-fulfill.service";
import { getServiceSupabase } from "../config/supabase";
import { shareVisibleToRecruiter } from "../services/share-directory";

function unavailable(err: unknown): boolean {
  return isMissingRelationError(err);
}

export async function listMyVerificationRequests(req: Request, res: Response): Promise<Response> {
  if (!await verificationStorageAvailable()) return sendSuccess(res, { available: false, requests: [] });
  try {
    const requests = await createVerificationWorkflow().listForLearner(req.user!.id);
    return sendSuccess(res, { available: true, requests });
  } catch (err) {
    if (unavailable(err)) return sendSuccess(res, { available: false, requests: [] });
    throw err;
  }
}

export async function listMyNotifications(req: Request, res: Response): Promise<Response> {
  if (!await verificationStorageAvailable()) return sendSuccess(res, { available: false, notifications: [] });
  try {
    const notifications = await createVerificationWorkflow().listNotifications(req.user!.id);
    return sendSuccess(res, { available: true, notifications });
  } catch (err) {
    if (unavailable(err)) return sendSuccess(res, { available: false, notifications: [] });
    throw err;
  }
}

async function markOwnNotificationRead(req: Request, res: Response, audience: "learner" | "recruiter"): Promise<Response> {
  const id = paramString(req.params.notificationId, "notificationId");
  const notifications = await createVerificationWorkflow().listNotifications(req.user!.id);
  const owned = notifications.find((row) => row.id === id && row.audience === audience && row.recipientUserId === req.user!.id);
  if (!owned) throw new AppError("Notification not found", 404);
  const { createSupabaseVerificationDirectory } = await import("../services/zkp-notification.store");
  const updated = await createSupabaseVerificationDirectory().markRead(id, req.user!.id);
  if (!updated || updated.title !== owned.title || updated.body !== owned.body) {
    throw new AppError("Notification not found", 404);
  }
  return sendSuccess(res, updated);
}

export async function markMyNotificationRead(req: Request, res: Response): Promise<Response> {
  return markOwnNotificationRead(req, res, "learner");
}

export async function markRecruiterNotificationRead(req: Request, res: Response): Promise<Response> {
  return markOwnNotificationRead(req, res, "recruiter");
}

export async function approveVerificationRequest(req: Request, res: Response): Promise<Response> {
  try {
    const request = await createVerificationWorkflow().approve(paramString(req.params.requestId, "requestId"), req.user!.id);
    return sendSuccess(res, request, "Request approved");
  } catch (err) {
    if (unavailable(err)) throw new AppError("Verification requests are not available until the notification table is applied.", 503);
    throw err;
  }
}

export async function rejectVerificationRequest(req: Request, res: Response): Promise<Response> {
  try {
    const request = await createVerificationWorkflow().reject(paramString(req.params.requestId, "requestId"), req.user!.id);
    if (request.legacyScoreRequestId) {
      await createSupabaseScoreRequestStore().decline(request.legacyScoreRequestId, req.user!.id, Date.now());
    }
    return sendSuccess(res, request, "Request declined");
  } catch (err) {
    if (unavailable(err)) throw new AppError("Verification requests are not available until the notification table is applied.", 503);
    throw err;
  }
}

export async function listRecruiterVerificationRequests(req: Request, res: Response): Promise<Response> {
  if (!await verificationStorageAvailable()) return sendSuccess(res, { available: false, requests: [] });
  try {
    const requests = await createVerificationWorkflow().listForRecruiter(req.user!.id);
    return sendSuccess(res, { available: true, requests });
  } catch (err) {
    if (unavailable(err)) return sendSuccess(res, { available: false, requests: [] });
    throw err;
  }
}

const githubRequestSchema = z.object({
  learnerUserId: z.string().uuid(),
  threshold: z.union([z.literal(50), z.literal(100), z.literal(150)]),
}).strict();

const githubProofSchema = z.object({
  repositoryFullName: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
}).strict();

async function learnerSharedWithRecruiter(learnerUserId: string, recruiterUserId: string): Promise<boolean> {
  const { data, error } = await getServiceSupabase()
    .from("selective_disclosure_presentations")
    .select("learner_id, expires_at, revoked_at, disclosed_payload")
    .eq("learner_id", learnerUserId)
    .is("revoked_at", null)
    .limit(100);
  if (error) return false;
  return (data ?? []).some((row) => shareVisibleToRecruiter({
    revokedAt: row.revoked_at,
    expiresAt: row.expires_at,
    disclosedPayload: row.disclosed_payload,
    recruiterUserId,
  }));
}

export async function createGithubActivityRequest(req: Request, res: Response): Promise<Response> {
  if (!await verificationStorageAvailable()) {
    throw new AppError("Verification requests are not available until the notification table is applied.", 503);
  }
  const body = githubRequestSchema.parse(req.body ?? {});
  if (body.learnerUserId === req.user!.id) throw new AppError("Verification request not found", 404);
  if (!await learnerSharedWithRecruiter(body.learnerUserId, req.user!.id)) {
    throw new AppError("This learner has not shared a profile with you.", 403);
  }
  const labels = await verificationPartyLabels(req.user!.id, body.learnerUserId);
  const request = await createVerificationWorkflow().recordGithubActivityRequest({
    recruiterUserId: req.user!.id,
    learnerUserId: body.learnerUserId,
    recruiterLabel: labels.recruiterLabel,
    learnerLabel: labels.learnerLabel,
    threshold: body.threshold,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });
  return sendSuccess(res, {
    id: request.id,
    category: request.category,
    policyLabel: request.policyLabel,
    threshold: request.threshold,
    status: request.status,
    expiresAt: request.expiresAt,
  }, "GitHub activity request created");
}

export async function proveGithubActivityRequest(req: Request, res: Response): Promise<Response> {
  const body = githubProofSchema.parse(req.body ?? {});
  const result = await fulfillGithubActivityRequest({
    requestId: paramString(req.params.requestId, "requestId"),
    learnerUserId: req.user!.id,
    repositoryFullName: body.repositoryFullName,
  });
  return sendSuccess(res, result, "GitHub activity request updated");
}

export async function listRecruiterNotifications(req: Request, res: Response): Promise<Response> {
  if (!await verificationStorageAvailable()) return sendSuccess(res, { available: false, notifications: [] });
  try {
    const notifications = await createVerificationWorkflow().listNotifications(req.user!.id);
    return sendSuccess(res, { available: true, notifications });
  } catch (err) {
    if (unavailable(err)) return sendSuccess(res, { available: false, notifications: [] });
    throw err;
  }
}
