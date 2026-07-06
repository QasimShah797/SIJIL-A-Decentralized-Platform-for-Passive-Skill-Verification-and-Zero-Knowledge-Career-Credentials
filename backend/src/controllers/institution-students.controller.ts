/**
 * Institution student management HTTP handlers.
 */
import { Request, Response } from "express";
import { institutionStudentsService } from "../services/institution-students.service";
import { sendSuccess } from "../utils/apiResponse";
import { createInstitutionStudentSchema } from "../validators/institution-students.validator";
import { AppError } from "../utils/AppError";

export async function listInstitutionStudents(req: Request, res: Response): Promise<Response> {
  if (!req.user) throw new AppError("Authentication required", 401);
  const students = await institutionStudentsService.listStudents(req.user.id);
  return sendSuccess(res, students);
}

export async function createInstitutionStudent(req: Request, res: Response): Promise<Response> {
  if (!req.user) throw new AppError("Authentication required", 401);
  const input = createInstitutionStudentSchema.parse(req.body);
  const student = await institutionStudentsService.createStudent(req.user.id, input);
  return sendSuccess(res, student, "Student created", 201);
}
