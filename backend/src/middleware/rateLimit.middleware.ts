/**
 * In-memory IP rate limiter for public endpoints.
 */
import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/AppError";

export const PUBLIC_VERIFY_RATE_LIMIT = { windowMs: 60_000, max: 20 } as const;

export function rateLimit(options: { windowMs: number; max: number }): (
  req: Request,
  _res: Response,
  next: NextFunction,
) => void {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req: Request, _res: Response, next: NextFunction): void => {
    const forwarded = req.headers["x-forwarded-for"];
    const forwardedIp = typeof forwarded === "string" ? forwarded.split(",")[0]?.trim() : undefined;
    const ip = forwardedIp || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const current = hits.get(ip);

    if (!current || current.resetAt <= now) {
      hits.set(ip, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    current.count += 1;
    if (current.count > options.max) {
      next(new AppError("Too many requests", 429));
      return;
    }
    next();
  };
}
