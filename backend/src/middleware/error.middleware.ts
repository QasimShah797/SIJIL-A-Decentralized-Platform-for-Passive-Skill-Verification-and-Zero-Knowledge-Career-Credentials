/**
 * Centralized Express error handler — converts AppError and Zod errors to JSON responses.
 */
import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/AppError";
import { sendError } from "../utils/apiResponse";
import { env } from "../config/env";

export function errorMiddleware(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): Response {
  if (err instanceof AppError) {
    return sendError(res, err.message, err.statusCode);
  }

  if (err instanceof ZodError) {
    return sendError(res, "Validation failed", 400, err.flatten().fieldErrors);
  }

  console.error("[SIJIL Backend Error]", err);

  const message =
    env.NODE_ENV === "production" ? "Internal server error" : err.message;

  return sendError(res, message, 500);
}
