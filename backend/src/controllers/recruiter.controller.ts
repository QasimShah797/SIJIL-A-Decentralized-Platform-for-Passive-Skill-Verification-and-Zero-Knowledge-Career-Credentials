/**
 * Recruiter verification and search HTTP handlers — delegate to recruiterService.
 */
import { Request, Response } from "express";
import { recruiterService } from "../services/recruiter.service";
import { sendSuccess } from "../utils/apiResponse";
import { searchQuerySchema } from "../validators/recruiter.validator";
import { paramString } from "../utils/params";

export async function verifyCredential(req: Request, res: Response): Promise<Response> {
  const result = await recruiterService.verifyCredential(paramString(req.params.credentialId, "credentialId"));
  return sendSuccess(res, result);
}

export async function getCandidate(req: Request, res: Response): Promise<Response> {
  const candidate = await recruiterService.getCandidate(paramString(req.params.candidateId, "candidateId"));
  return sendSuccess(res, candidate);
}

export async function searchCandidates(req: Request, res: Response): Promise<Response> {
  const query = searchQuerySchema.parse(req.query);
  const candidates = await recruiterService.search(query);
  return sendSuccess(res, candidates);
}
