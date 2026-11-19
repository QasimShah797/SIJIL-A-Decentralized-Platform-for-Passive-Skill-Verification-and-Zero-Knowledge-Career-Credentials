/**
 * Recruiter requests and learner submissions for score-threshold-v1.
 * Responses never include the score, blinding, or witness.
 */
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { Request, Response } from "express";
import { z } from "zod";
import { sendSuccess } from "../utils/apiResponse";
import { AppError } from "../utils/AppError";
import { paramString } from "../utils/params";
import { walletService } from "../services/wallet.service";
import { findCredentialForLearnerCompetency, loadCredentialByIdOrUri } from "../services/credential-verify.service";
import { readPinnedVerificationKey } from "../services/zkp-verify";
import { verifyCredentialHash } from "../services/signing.service";
import { getEvaluateLedgerService } from "../services/ledger.factory";
import {
  createScoreRequest,
  publicRequest,
  recheckConsumedRequest,
  submitScoreRequest,
  type ScoreRequestDependencies,
} from "../services/zkp-score-request";
import { createSupabaseScoreRequestStore } from "../services/zkp-score-request.store";
import { recordPracticalVerificationRequest, syncPracticalVerification } from "../services/zkp-notification.store";

const createSchema = z.object({
  shareToken: z.string().min(16).max(512).optional(),
  presentationId: z.string().uuid().optional(),
  threshold: z.number().int().min(0).max(100),
}).strict().refine((body) => Boolean(body.shareToken) !== Boolean(body.presentationId), {
  message: "Provide either a share token or a direct share id.",
});

const proofSchema = z.object({
  circuitId: z.literal("score-threshold-v1"),
  proof: z.unknown(),
  publicSignals: z.array(z.string()).length(2),
}).strict();

function dependencies(): ScoreRequestDependencies {
  return {
    store: createSupabaseScoreRequestStore(),
    now: Date.now,
    loadCredential: loadCredentialByIdOrUri,
    verifySignature: verifyCredentialHash,
    readVerificationKey: () => {
      const pinned = readPinnedVerificationKey();
      return pinned ? { key: pinned.key } : null;
    },
    verifyGroth16: async (key, signals, proof) => {
      try {
        const snarkjs = createRequire(__filename)("snarkjs") as {
          groth16: { verify: (verificationKey: object, publicSignals: string[], proof: unknown) => Promise<boolean> };
        };
        return await snarkjs.groth16.verify(key, signals, proof) === true;
      } catch {
        return false;
      }
    },
    ledger: getEvaluateLedgerService(),
  };
}

export async function createRecruiterScoreRequest(req: Request, res: Response): Promise<Response> {
  const body = createSchema.parse(req.body ?? {});
  const share = body.presentationId
    ? await walletService.resolveDirectShareForRecruiter(body.presentationId, req.user!.id)
    : await walletService.resolveShareForZkp(body.shareToken!);
  const credential = await findCredentialForLearnerCompetency(share.learnerId, share.competencyId);
  if (!credential) throw new AppError("Credential not found", 404);
  const deps = dependencies();
  const row = await createScoreRequest({
    recruiterUserId: req.user!.id,
    learnerUserId: share.learnerId,
    credential,
    threshold: body.threshold,
    shareToken: body.shareToken ?? randomUUID(),
    dependencies: deps,
  });
  await recordPracticalVerificationRequest({
    legacyScoreRequestId: row.id,
    recruiterUserId: row.recruiterUserId,
    learnerUserId: row.learnerUserId,
    skillLabel: credential.skill_name?.trim() || credential.name,
    threshold: row.threshold,
    expiresAt: row.expiresAt,
  });
  return sendSuccess(res, publicRequest(row, deps.now()), "Verification request created", 201);
}

export async function listRecruiterScoreRequests(req: Request, res: Response): Promise<Response> {
  const deps = dependencies();
  const availability = await deps.store.checkAvailability();
  const rows = availability.available ? await deps.store.listForRecruiter(req.user!.id) : [];
  return sendSuccess(res, {
    available: availability.available,
    requests: rows.map((row) => publicRequest(row, deps.now())),
  });
}

export async function getRecruiterScoreRequest(req: Request, res: Response): Promise<Response> {
  const deps = dependencies();
  const row = await deps.store.getById(paramString(req.params.requestId, "requestId"));
  if (!row || row.recruiterUserId !== req.user!.id || row.audience !== req.user!.id) {
    throw new AppError("Verification request not found", 404);
  }
  const request = publicRequest(row, deps.now());
  if (row.status !== "consumed") {
    return sendSuccess(res, { request, decision: null });
  }
  const decision = await recheckConsumedRequest({ request: row, dependencies: deps });
  return sendSuccess(res, { request, decision });
}

export async function listLearnerScoreRequests(req: Request, res: Response): Promise<Response> {
  const deps = dependencies();
  const availability = await deps.store.checkAvailability();
  const rows = availability.available ? await deps.store.listForLearner(req.user!.id) : [];
  return sendSuccess(res, {
    available: availability.available,
    reason: availability.available ? null : availability.reason,
    requests: rows.map((row) => publicRequest(row, deps.now())),
  });
}

export async function declineLearnerScoreRequest(req: Request, res: Response): Promise<Response> {
  const deps = dependencies();
  const row = await deps.store.decline(
    paramString(req.params.requestId, "requestId"),
    req.user!.id,
    deps.now(),
  );
  if (!row) throw new AppError("Verification request not found", 404);
  await syncPracticalVerification({
    legacyScoreRequestId: row.id,
    outcome: row.status === "expired" ? "expired" : "rejected",
  });
  return sendSuccess(res, publicRequest(row, deps.now()));
}

export async function submitLearnerScoreProof(req: Request, res: Response): Promise<Response> {
  const body = proofSchema.parse(req.body ?? {});
  const requestId = paramString(req.params.requestId, "requestId");
  await syncPracticalVerification({ legacyScoreRequestId: requestId, outcome: "generating" });
  let decision;
  try {
    decision = await submitScoreRequest({
      requestId,
      learnerUserId: req.user!.id,
      circuitId: body.circuitId,
      proof: body.proof,
      publicSignals: body.publicSignals,
      dependencies: dependencies(),
    });
  } catch (err) {
    await syncPracticalVerification({ legacyScoreRequestId: requestId, outcome: "proof-failed" });
    throw err;
  }
  const outcome = decision.accepted
    ? "verified"
    : decision.checks.request === "expired"
      ? "expired"
      : decision.checks.request === "used" || decision.checks.revocation === "revoked"
        ? "failed"
        : "proof-failed";
  await syncPracticalVerification({ legacyScoreRequestId: requestId, outcome });
  res.setHeader("Pragma", "no-cache");
  return sendSuccess(res, decision);
}
