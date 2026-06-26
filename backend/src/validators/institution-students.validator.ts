/**
 * Zod validation for institution student provisioning.
 */
import { z } from "zod";

export const createInstitutionStudentSchema = z.object({
  fullName: z.string().trim().min(2, "Full name is required").max(120),
  universityEmail: z.string().trim().email("Valid university email required").max(255),
  registrationNumber: z.string().trim().min(1, "Registration number is required").max(64),
  department: z.string().trim().min(1, "Department is required").max(120),
  program: z.string().trim().min(1, "Program is required").max(120),
  batchSemester: z.string().trim().min(1, "Batch/semester is required").max(64),
});

export type CreateInstitutionStudentInput = z.infer<typeof createInstitutionStudentSchema>;
