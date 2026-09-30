/**
 * Zod validation for public issuer DID lookup.
 */
import { z } from "zod";

export const issuerDidParamSchema = z.object({
  did: z.string().min(3),
});
