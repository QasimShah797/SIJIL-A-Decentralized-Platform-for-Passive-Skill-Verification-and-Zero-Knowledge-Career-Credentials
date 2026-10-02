/**
 * Zod validation schemas for recruiter interview scheduling endpoints.
 */
import { z } from "zod";
import {
  INTERVIEW_DURATION_MAX,
  INTERVIEW_DURATION_MIN,
  INTERVIEW_MODE,
} from "../constants/interview";

export const scheduleInterviewSchema = z.object({
  candidateId: z.string().uuid(),
  scheduledAt: z.string().min(1).refine(
    (value) => !Number.isNaN(Date.parse(value)),
    "A valid interview date and time is required",
  ),
  durationMinutes: z.coerce
    .number()
    .int()
    .min(INTERVIEW_DURATION_MIN)
    .max(INTERVIEW_DURATION_MAX),
  mode: z.enum([
    INTERVIEW_MODE.IN_PERSON,
    INTERVIEW_MODE.VIDEO_CALL,
    INTERVIEW_MODE.PHONE,
  ]),
  locationOrLink: z.string().trim().min(3).max(2000),
  notes: z.string().trim().max(2000).optional(),
});

export const listInterviewsQuerySchema = z.object({
  candidateId: z.string().uuid().optional(),
});
