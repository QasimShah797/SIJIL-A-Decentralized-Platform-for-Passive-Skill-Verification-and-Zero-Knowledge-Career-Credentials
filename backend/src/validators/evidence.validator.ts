/**
 * Zod validation schemas for evidence submission endpoints.
 */
import { z } from "zod";

export const submitEvidenceSchema = z.object({
  skillId: z.string().uuid(),
  title: z.string().min(1, "Title is required"),
  url: z.string().url().optional().or(z.literal("")),
  source: z.string().optional(),
});

export const updateEvidenceStatusSchema = z.object({
  status: z.enum(["Pending", "Reviewed", "Accepted", "Rejected"]),
});

export const evidenceSkillParamSchema = z.object({
  skillId: z.string().uuid(),
});

export const evidenceIdParamSchema = z.object({
  id: z.string().uuid(),
});
