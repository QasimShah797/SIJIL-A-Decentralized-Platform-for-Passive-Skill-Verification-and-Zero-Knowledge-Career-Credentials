/**
 * Zod schemas for GitHub integration and evidence record endpoints.
 */
import { z } from "zod";

export const githubSyncSchema = z.object({
  declaredSkills: z
    .array(z.object({ id: z.string().uuid(), name: z.string(), domain: z.string().optional() }))
    .optional(),
});

export const linkEvidenceSchema = z.object({
  evidenceId: z.string().uuid(),
});

export const evidenceIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const unlinkEvidenceSchema = z.object({
  evidenceId: z.string().uuid(),
});

export const unlinkRepoSchema = z.object({
  repoId: z.string().uuid(),
  skillId: z.string().uuid().optional(),
});
