/**
 * Evidence submission HTTP handlers — delegate to evidenceService.
 */
import { Request, Response } from "express";
import { evidenceService } from "../services/evidence.service";
import { sendSuccess } from "../utils/apiResponse";
import { submitEvidenceSchema, updateEvidenceStatusSchema } from "../validators/evidence.validator";
import { paramString } from "../utils/params";

export async function submitEvidence(req: Request, res: Response): Promise<Response> {
  const input = submitEvidenceSchema.parse(req.body);
  const evidence = await evidenceService.submit(req.user!.id, {
    ...input,
    url: input.url || undefined,
  });
  return sendSuccess(res, evidence, "Evidence submitted", 201);
}

export async function getEvidenceBySkill(req: Request, res: Response): Promise<Response> {
  const records = await evidenceService.listBySkill(req.user!.id, paramString(req.params.skillId, "skillId"));
  return sendSuccess(res, records);
}

export async function updateEvidenceStatus(req: Request, res: Response): Promise<Response> {
  const { status } = updateEvidenceStatusSchema.parse(req.body);
  const evidence = await evidenceService.updateStatus(req.user!.id, paramString(req.params.id, "id"), status);
  return sendSuccess(res, evidence);
}
