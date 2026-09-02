/**
 * Recruiter verification and search HTTP handlers — delegate to recruiterService.
 */
import { Request, Response } from "express";
import { recruiterService } from "../services/recruiter.service";
import { sendSuccess } from "../utils/apiResponse";
import { searchQuerySchema, profileFieldsQuerySchema } from "../validators/recruiter.validator";
import { paramString } from "../utils/params";

export async function verifyCredential(req: Request, res: Response): Promise<Response> {
  const result = await recruiterService.verifyCredential(paramString(req.params.credentialId, "credentialId"));
  return sendSuccess(res, result);
}

export async function getCandidate(req: Request, res: Response): Promise<Response> {
  const candidate = await recruiterService.getCandidate(
    paramString(req.params.candidateId, "candidateId"),
    req.accessToken,
  );
  return sendSuccess(res, candidate);
}

export async function searchCandidates(req: Request, res: Response): Promise<Response> {
  const query = searchQuerySchema.parse(req.query);
  const candidates = await recruiterService.search(query, req.accessToken);
  return sendSuccess(res, candidates);
}

export async function getCandidateProfileFields(req: Request, res: Response): Promise<Response> {
  const { ids } = profileFieldsQuerySchema.parse(req.query);
  const idList = ids.split(",").map((id) => id.trim()).filter(Boolean);
  const fields = await recruiterService.getCandidateProfileFields(idList);
  return sendSuccess(res, fields);
}
