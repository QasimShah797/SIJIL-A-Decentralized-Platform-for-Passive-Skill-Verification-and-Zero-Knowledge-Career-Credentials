/**
 * Zod validation schemas for credential issuing and sharing endpoints.
 */
import { z } from "zod";

export const issueCredentialSchema = z.object({
  skillId: z.string().uuid(),
});

export const shareCredentialSchema = z.object({
  credentialId: z.string().min(1),
  recipient: z.string().min(1),
  recipientDid: z.string().optional(),
  disclosedFields: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      value: z.string(),
    }),
  ),
  hiddenFields: z.array(z.string()).optional(),
  expiresInDays: z.number().int().positive().optional(),
});

export const revokeShareSchema = z.object({
  token: z.string().min(1),
});

export const credentialIdParamSchema = z.object({
  id: z.string().min(1),
});

export const learnerIdParamSchema = z.object({
  learnerId: z.string().uuid(),
});
