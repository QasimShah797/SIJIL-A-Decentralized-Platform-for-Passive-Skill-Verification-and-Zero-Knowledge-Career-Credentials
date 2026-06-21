/**
 * Zod validation schemas for attestation decision endpoints.
 */
import { z } from "zod";

export const attestationDecisionSchema = z.object({
  id: z.string().uuid(),
  remarks: z.string().optional(),
});
