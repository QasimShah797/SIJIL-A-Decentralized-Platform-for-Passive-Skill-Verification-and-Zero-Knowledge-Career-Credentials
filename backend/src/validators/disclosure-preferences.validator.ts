import { z } from "zod";

/** Only the two disclosure permissions; thresholds, scores, counts, and outcomes are rejected. */
export const disclosurePreferencesPatchSchema = z
  .object({
    shareExactAssessmentMarks: z.boolean().optional(),
    shareExactGithubCommitCount: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) => value.shareExactAssessmentMarks !== undefined || value.shareExactGithubCommitCount !== undefined,
    { message: "Provide at least one disclosure setting" },
  );
