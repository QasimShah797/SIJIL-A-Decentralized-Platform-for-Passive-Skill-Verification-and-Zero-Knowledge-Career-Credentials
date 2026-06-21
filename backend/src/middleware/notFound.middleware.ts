/**
 * 404 handler for unmatched API routes.
 */
import { Request, Response } from "express";
import { sendError } from "../utils/apiResponse";

export function notFoundMiddleware(req: Request, res: Response): Response {
  return sendError(res, `Route not found: ${req.method} ${req.originalUrl}`, 404);
}
