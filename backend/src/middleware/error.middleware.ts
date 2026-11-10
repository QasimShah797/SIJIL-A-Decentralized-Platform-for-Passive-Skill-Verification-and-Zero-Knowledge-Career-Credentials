/**
 * Centralized Express error handler — converts AppError and Zod errors to JSON responses.
 */
import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/AppError";
import { LedgerDisabledError } from "../services/ledger.errors";
import { sendError } from "../utils/apiResponse";
import { env } from "../config/env";

const DATABASE_DETAIL = /schema cache|does not exist|relation |syntax error|password|private key|BEGIN PRIVATE|secret/i;

export function clientErrorMessage(err: AppError): string {
  if (err.statusCode >= 500 && DATABASE_DETAIL.test(err.message)) {
    return err.statusCode === 503
      ? "This action is temporarily unavailable."
      : "Internal server error";
  }
  return err.message;
}

export function errorMiddleware(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): Response {
  if (err instanceof AppError) {
    if (clientErrorMessage(err) !== err.message) {
      console.error("[SIJIL Backend Error]", err.message);
    }
    return sendError(res, clientErrorMessage(err), err.statusCode);
  }

  if (err instanceof LedgerDisabledError) {
    return sendError(res, err.message, 503);
  }

  if (err instanceof ZodError) {
    return sendError(res, "Validation failed", 400, err.flatten().fieldErrors);
  }

  console.error("[SIJIL Backend Error]", err);

  const message =
    env.NODE_ENV === "production" ? "Internal server error" : err.message;

  return sendError(res, message, 500);
}
