import { Request, Response } from "express";
import { sendSuccess } from "../utils/apiResponse";
import { ssiBindSchema, ssiDidQuerySchema } from "../validators/ssi.validator";
import { ssiService } from "../services/ssi.service";

export async function createSsiChallenge(req: Request, res: Response): Promise<Response> {
  const challenge = ssiService.issueChallenge(req.user!.id);
  return sendSuccess(res, challenge, "SSI ownership challenge issued", 201);
}

export async function getSsiIdentity(req: Request, res: Response): Promise<Response> {
  const identity = await ssiService.getIdentity(req.user!.id);
  return sendSuccess(res, identity);
}

export async function bindSsiIdentity(req: Request, res: Response): Promise<Response> {
  const input = ssiBindSchema.parse(req.body);
  const identity = await ssiService.bindIdentity(req.user!.id, input);
  return sendSuccess(res, identity, "SSI identity bound", 201);
}

export async function resolveSsiDid(req: Request, res: Response): Promise<Response> {
  const { did } = ssiDidQuerySchema.parse(req.query);
  const resolved = ssiService.resolvePublic(did);
  return sendSuccess(res, resolved);
}
