/**
 * Skill declaration HTTP handlers — delegate to skillsService.
 */
import { Request, Response } from "express";
import { skillsService } from "../services/skills.service";
import { sendSuccess } from "../utils/apiResponse";
import { createSkillSchema, updateSkillSchema } from "../validators/skills.validator";
import { paramString } from "../utils/params";

export async function listSkills(req: Request, res: Response): Promise<Response> {
  const skills = await skillsService.listByUser(req.user!.id);
  return sendSuccess(res, skills);
}

export async function createSkill(req: Request, res: Response): Promise<Response> {
  const input = createSkillSchema.parse(req.body);
  const skill = await skillsService.create(req.user!.id, input);
  return sendSuccess(res, skill, "Skill declared", 201);
}

export async function declareSkill(req: Request, res: Response): Promise<Response> {
  const input = createSkillSchema.parse(req.body);
  const result = await skillsService.create(req.user!.id, input);
  return sendSuccess(res, result, "Skill declared", 201);
}

export async function getSkill(req: Request, res: Response): Promise<Response> {
  const skill = await skillsService.getById(req.user!.id, paramString(req.params.id, "id"));
  return sendSuccess(res, skill);
}

export async function getRelatedEvidence(req: Request, res: Response): Promise<Response> {
  const result = await skillsService.getSkillWithRelatedEvidence(
    req.user!.id,
    paramString(req.params.skillId ?? req.params.id, "skillId"),
  );
  return sendSuccess(res, result);
}

export async function updateSkill(req: Request, res: Response): Promise<Response> {
  const input = updateSkillSchema.parse(req.body);
  const skill = await skillsService.update(req.user!.id, paramString(req.params.id, "id"), input);
  return sendSuccess(res, skill);
}

export async function deleteSkill(req: Request, res: Response): Promise<Response> {
  await skillsService.delete(req.user!.id, paramString(req.params.id, "id"));
  return sendSuccess(res, null, "Skill deleted");
}
