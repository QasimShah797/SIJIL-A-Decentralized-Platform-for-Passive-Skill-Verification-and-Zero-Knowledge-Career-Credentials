/**
 * Query validation for GET /api/learner/journey (Phase 1).
 */
import { z } from "zod";

export const JOURNEY_EVENT_TYPES = [
  "assessment_completed",
  "supporting_evidence_added",
  "github_activity_observed",
  "github_project_evidence_synced",
  "credential_issued",
  "credential_revoked",
] as const;

export type JourneyEventType = (typeof JOURNEY_EVENT_TYPES)[number];

const eventTypeSchema = z.enum(JOURNEY_EVENT_TYPES);

export const learnerJourneyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).max(512).optional(),
  competencyId: z.string().uuid().optional(),
  eventTypes: z
    .string()
    .optional()
    .transform((raw, ctx) => {
      if (raw == null || raw.trim() === "") return undefined;
      const parts = raw.split(",").map((part) => part.trim()).filter(Boolean);
      const out: JourneyEventType[] = [];
      for (const part of parts) {
        const parsed = eventTypeSchema.safeParse(part);
        if (!parsed.success) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Invalid eventType: ${part}`,
          });
          return z.NEVER;
        }
        out.push(parsed.data);
      }
      return out.length > 0 ? out : undefined;
    }),
});

export type LearnerJourneyQuery = z.infer<typeof learnerJourneyQuerySchema>;
