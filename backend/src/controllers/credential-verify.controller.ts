/**
 * Public, unauthenticated credential ledger verification.
 */
import { Request, Response } from "express";
import { sendSuccess } from "../utils/apiResponse";
import { verifyPublicCredential } from "../services/credential-verify.service";
import { paramString } from "../utils/params";

export async function verifyPublicCredentialById(req: Request, res: Response): Promise<Response> {
  const result = await verifyPublicCredential(paramString(req.params.credentialId, "credentialId"));
  return sendSuccess(res, result);
}
