/**
 * Health check controller — confirms API availability.
 */
import { Request, Response } from "express";
import { sendSuccess } from "../utils/apiResponse";

export function healthCheck(_req: Request, res: Response): Response {
  return sendSuccess(res, {
    status: "ok",
    service: "sijil-backend",
    timestamp: new Date().toISOString(),
  });
}
