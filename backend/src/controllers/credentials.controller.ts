/**
 * Credential issuing and wallet HTTP handlers — delegate to credentialsService.
 */
import { Request, Response } from "express";
import { credentialsService } from "../services/credentials.service";
import { retryCredentialAnchor } from "../services/anchor-worker.service";
import { revokeIssuedCredential } from "../services/credential-verify.service";
import { sendSuccess } from "../utils/apiResponse";
import {
  issueCredentialSchema,
  shareCredentialSchema,
  revokeShareSchema,
  revokeCredentialSchema,
} from "../validators/credentials.validator";
import { paramString } from "../utils/params";
import { callerFromRequest } from "../services/learner-access";

export async function issueCredential(req: Request, res: Response): Promise<Response> {
  const input = issueCredentialSchema.parse(req.body);
  const credential = await credentialsService.issue(req.user!.id, input);
  return sendSuccess(res, credential, "Credential issued", 201);
}

export async function getCredential(req: Request, res: Response): Promise<Response> {
  const credential = await credentialsService.getByUri(
    paramString(req.params.id, "id"),
    callerFromRequest(req),
  );
  return sendSuccess(res, credential);
}

export async function getWallet(req: Request, res: Response): Promise<Response> {
  const credentials = await credentialsService.getWallet(
    paramString(req.params.learnerId, "learnerId"),
    callerFromRequest(req),
  );
  return sendSuccess(res, credentials);
}

export async function shareCredential(req: Request, res: Response): Promise<Response> {
  const input = shareCredentialSchema.parse(req.body);
  const result = await credentialsService.share(req.user!.id, input);
  return sendSuccess(res, result, "Presentation shared", 201);
}

export async function revokeShare(req: Request, res: Response): Promise<Response> {
  const input = revokeShareSchema.parse(req.body);
  await credentialsService.revokeShare(req.user!.id, input);
  return sendSuccess(res, null, "Share revoked");
}

export async function retryAnchor(req: Request, res: Response): Promise<Response> {
  const result = await retryCredentialAnchor(paramString(req.params.id, "id"));
  return sendSuccess(res, result, "Anchor retry completed");
}

export async function revokeCredential(req: Request, res: Response): Promise<Response> {
  const input = revokeCredentialSchema.parse(req.body);
  const result = await revokeIssuedCredential(paramString(req.params.id, "id"), input.reason);
  return sendSuccess(res, result, "Credential revoked");
}
