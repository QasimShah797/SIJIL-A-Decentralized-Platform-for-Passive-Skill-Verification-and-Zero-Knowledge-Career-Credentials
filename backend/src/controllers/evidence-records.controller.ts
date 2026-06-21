/**
 * Evidence records HTTP handlers — unmapped list, link, ignore.
 */
import { Request, Response } from "express";
import { evidenceRecordsService } from "../services/evidence-records.service";
import { sendSuccess } from "../utils/apiResponse";
import { linkEvidenceSchema, unlinkEvidenceSchema, unlinkRepoSchema } from "../validators/github.validator";
import { paramString } from "../utils/params";

export async function getUnmappedEvidence(req: Request, res: Response): Promise<Response> {
  const records = await evidenceRecordsService.listUnmapped(req.user!.id);
  return sendSuccess(res, records);
}

export async function linkEvidenceToSkill(req: Request, res: Response): Promise<Response> {
  const skillId = paramString(req.params.skillId, "skillId");
  const { evidenceId } = linkEvidenceSchema.parse(req.body);
  const record = await evidenceRecordsService.linkToSkill(req.user!.id, skillId, evidenceId);
  return sendSuccess(res, record, "Evidence linked to skill");
}

export async function unlinkEvidenceFromSkill(req: Request, res: Response): Promise<Response> {
  const skillId = paramString(req.params.skillId, "skillId");
  const { evidenceId } = unlinkEvidenceSchema.parse(req.body);
  const record = await evidenceRecordsService.unlinkFromSkill(req.user!.id, skillId, evidenceId);
  return sendSuccess(res, record, "Evidence unlinked from skill");
}

export async function unlinkRepoEvidence(req: Request, res: Response): Promise<Response> {
  const { repoId, skillId } = unlinkRepoSchema.parse(req.body);
  await evidenceRecordsService.unlinkByRepoId(req.user!.id, repoId, skillId);
  return sendSuccess(res, null, "Repository unlinked from skill");
}

export async function ignoreEvidence(req: Request, res: Response): Promise<Response> {
  const evidenceId = paramString(req.params.id, "id");
  const record = await evidenceRecordsService.ignore(req.user!.id, evidenceId);
  return sendSuccess(res, record, "Evidence ignored");
}
