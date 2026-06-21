/**
 * Credential issuing and wallet HTTP handlers — delegate to credentialsService.
 */
import { Request, Response } from "express";
import { credentialsService } from "../services/credentials.service";
import { sendSuccess } from "../utils/apiResponse";
import {
  issueCredentialSchema,
  shareCredentialSchema,
  revokeShareSchema,
} from "../validators/credentials.validator";
import { paramString } from "../utils/params";

export async function issueCredential(req: Request, res: Response): Promise<Response> {
  const input = issueCredentialSchema.parse(req.body);
  const credential = await credentialsService.issue(req.user!.id, input);
  return sendSuccess(res, credential, "Credential issued", 201);
}

export async function getCredential(req: Request, res: Response): Promise<Response> {
  const credential = await credentialsService.getByUri(paramString(req.params.id, "id"));
  return sendSuccess(res, credential);
}

export async function getWallet(req: Request, res: Response): Promise<Response> {
  const credentials = await credentialsService.getWallet(paramString(req.params.learnerId, "learnerId"));
  return sendSuccess(res, credentials);
}

export async function shareCredential(req: Request, res: Response): Promise<Response> {
  const input = shareCredentialSchema.parse(req.body);
  const result = await credentialsService.share(req.user!.id, input);
  return sendSuccess(res, result, "Presentation shared", 201);
}

export async function revokeShare(req: Request, res: Response): Promise<Response> {
  const input = revokeShareSchema.parse(req.body);
  await credentialsService.revokeShare(input);
  return sendSuccess(res, null, "Share revoked");
}
