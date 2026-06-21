/**
 * Zod validation schemas for skill declaration endpoints.
 */
import { z } from "zod";

export const createSkillSchema = z.object({
  name: z.string().min(1, "Skill name is required"),
  domain: z.string().optional(),
  description: z.string().optional(),
});

export const updateSkillSchema = z.object({
  name: z.string().min(1).optional(),
  domain: z.string().optional(),
  description: z.string().optional(),
  status: z.string().optional(),
  pipelineStage: z.string().optional(),
});

export const skillIdParamSchema = z.object({
  id: z.string().uuid(),
});
