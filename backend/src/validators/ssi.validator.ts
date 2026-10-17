import { z } from "zod";

export const ssiBindSchema = z.object({
  challengeId: z.string().uuid(),
  did: z.string().min(20).max(128).regex(/^did:key:z[1-9A-HJ-NP-Za-km-z]+$/),
  signature: z.string().regex(/^[A-Za-z0-9_-]+$/),
}).strict();

export const ssiDidQuerySchema = z.object({
  did: z.string().min(20).max(128).regex(/^did:key:z[1-9A-HJ-NP-Za-km-z]+$/),
});

export const ssiPresentationChallengeSchema = z.object({
  credentialIds: z.array(z.string().min(8).max(200)).min(1).max(20),
  audience: z.string().min(1).max(256).regex(/^[\x21-\x7E]+$/).optional(),
}).strict();

export const ssiPresentationSubmitSchema = z.object({
  challengeId: z.string().uuid(),
  did: z.string().min(20).max(128).regex(/^did:key:z[1-9A-HJ-NP-Za-km-z]+$/),
  signature: z.string().regex(/^[A-Za-z0-9_-]+$/),
}).strict();
