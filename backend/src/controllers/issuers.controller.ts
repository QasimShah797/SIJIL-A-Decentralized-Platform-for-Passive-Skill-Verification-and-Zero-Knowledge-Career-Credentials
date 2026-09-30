/**
 * Public issuer key lookup so third parties can verify Data Integrity proofs.
 */
import { Request, Response } from "express";
import { sendSuccess } from "../utils/apiResponse";
import { getIssuerPublicMaterial } from "../services/signing.service";
import { issuerDidParamSchema } from "../validators/issuers.validator";

export async function getIssuer(req: Request, res: Response): Promise<Response> {
  const { did: rawDid } = issuerDidParamSchema.parse(req.params);
  const did = decodeURIComponent(rawDid);
  const material = getIssuerPublicMaterial(did);
  return sendSuccess(res, material);
}
