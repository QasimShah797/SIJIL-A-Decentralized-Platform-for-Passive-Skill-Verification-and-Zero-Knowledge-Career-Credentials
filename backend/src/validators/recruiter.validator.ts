/**
 * Zod validation schemas for recruiter verification and search endpoints.
 */
import { z } from "zod";

export const verifyCredentialParamSchema = z.object({
  credentialId: z.string().min(1),
});

export const candidateIdParamSchema = z.object({
  candidateId: z.string().uuid(),
});

export const searchQuerySchema = z.object({
  q: z.string().optional(),
  skill: z.string().optional(),
  institution: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});
