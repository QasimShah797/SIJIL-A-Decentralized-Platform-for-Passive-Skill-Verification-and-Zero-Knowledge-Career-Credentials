/**
 * Zod validation for student account activation.
 */
import { z } from "zod";

export const strongPasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128)
  .regex(/[a-z]/, "Password must include a lowercase letter")
  .regex(/[A-Z]/, "Password must include an uppercase letter")
  .regex(/[0-9]/, "Password must include a number")
  .regex(/[^A-Za-z0-9]/, "Password must include a special character");

export const activationPreviewQuerySchema = z.object({
  token: z.string().trim().min(16, "Invalid activation token"),
});

export const activateStudentSchema = z
  .object({
    token: z.string().trim().min(16, "Invalid activation token"),
    password: strongPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type ActivateStudentInput = z.infer<typeof activateStudentSchema>;
