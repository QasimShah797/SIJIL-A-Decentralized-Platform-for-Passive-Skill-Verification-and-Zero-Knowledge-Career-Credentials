/**
 * Student activation HTTP handlers (public — token-based).
 */
import { Request, Response } from "express";
import { studentActivationService } from "../services/student-activation.service";
import { sendSuccess } from "../utils/apiResponse";
import {
  activateStudentSchema,
  activationPreviewQuerySchema,
} from "../validators/student-activation.validator";

export async function previewStudentActivation(req: Request, res: Response): Promise<Response> {
  const { token } = activationPreviewQuerySchema.parse(req.query);
  const preview = await studentActivationService.preview(token);
  return sendSuccess(res, preview);
}

export async function activateStudentAccount(req: Request, res: Response): Promise<Response> {
  const input = activateStudentSchema.parse(req.body);
  const result = await studentActivationService.activate(input);
  return sendSuccess(res, result, "Account activated");
}
