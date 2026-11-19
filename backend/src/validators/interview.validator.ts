/**
 * Zod validation schemas for recruiter interview scheduling endpoints.
 */
import { z } from "zod";
import {
  INTERVIEW_DURATION_MAX,
  INTERVIEW_DURATION_MIN,
  INTERVIEW_MODE,
} from "../constants/interview";

export const scheduleInterviewSchema = z
  .object({
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
    // Video calls may omit this — SIJIL generates a Google Meet URL.
    locationOrLink: z.string().trim().max(2000).optional().default(""),
    notes: z.string().trim().max(2000).optional(),
    timeZone: z.string().trim().min(1).max(100).optional().refine((value) => {
      if (!value) return true;
      try {
        Intl.DateTimeFormat(undefined, { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, "A valid IANA timezone is required"),
  })
  .superRefine((value, ctx) => {
    if (value.mode === INTERVIEW_MODE.VIDEO_CALL) return;
    if (!value.locationOrLink || value.locationOrLink.trim().length < 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["locationOrLink"],
        message: "Location or call details are required",
      });
    }
  });

export const listInterviewsQuerySchema = z.object({
  candidateId: z.string().uuid().optional(),
});
