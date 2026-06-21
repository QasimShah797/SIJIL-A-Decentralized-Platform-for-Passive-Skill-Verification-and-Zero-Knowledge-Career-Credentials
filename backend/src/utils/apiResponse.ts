/**
 * Consistent JSON response helpers for all API endpoints.
 */
import { Response } from "express";

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  message: string;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  errors?: unknown;
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  message = "OK",
  statusCode = 200,
): Response<ApiSuccessResponse<T>> {
  return res.status(statusCode).json({ success: true, message, data });
}

export function sendError(
  res: Response,
  message: string,
  statusCode = 500,
  errors?: unknown,
): Response<ApiErrorResponse> {
  return res.status(statusCode).json({ success: false, message, errors });
}
