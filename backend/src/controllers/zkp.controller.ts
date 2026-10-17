/**
 * Owner witness for in-browser Groth16 proving.
 * The response is not cached and is not a recruiter verification.
 */
import { Request, Response } from "express";
import { z } from "zod";
import { sendSuccess } from "../utils/apiResponse";
import { paramString } from "../utils/params";
import { AppError } from "../utils/AppError";
import { presentationTokenParamSchema } from "../validators/wallet.validator";
import { getOwnerWitness } from "../services/zkp-witness";
import { verifySharedScoreProof } from "../services/zkp-verify";

export async function getZkpWitness(req: Request, res: Response): Promise<Response> {
  const witness = await getOwnerWitness({
    callerUserId: req.user!.id,
    callerRoles: req.userRoles ?? [],
    credentialId: paramString(req.params.credentialId, "credentialId"),
  });
  res.setHeader("Pragma", "no-cache");
  res.setHeader("CDN-Cache-Control", "no-store");
  return sendSuccess(res, witness);
}

const recruiterProofSchema = z.object({
  shareToken: z.string().min(16).max(512),
}).passthrough();

async function respondWithProofVerification(token: string, body: unknown, res: Response): Promise<Response> {
  const decision = await verifySharedScoreProof(token, body);
  if (decision.httpStatus !== 200) {
    throw new AppError(decision.message, decision.httpStatus);
  }
  res.setHeader("Pragma", "no-cache");
  res.setHeader("CDN-Cache-Control", "no-store");
  return sendSuccess(res, decision.result);
}

export async function verifySharedScoreProofRequest(req: Request, res: Response): Promise<Response> {
  const { token } = presentationTokenParamSchema.parse(req.params);
  return respondWithProofVerification(token, req.body ?? {}, res);
}

export async function verifyRecruiterScoreProof(req: Request, res: Response): Promise<Response> {
  const { shareToken } = recruiterProofSchema.parse(req.body ?? {});
  return respondWithProofVerification(shareToken, req.body ?? {}, res);
}
