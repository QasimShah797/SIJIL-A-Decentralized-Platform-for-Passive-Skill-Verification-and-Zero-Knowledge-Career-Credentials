/**
 * In-memory IP rate limiter for public endpoints.
 * Uses Express `req.ip` (honours `trust proxy` only when TRUST_PROXY is enabled).
 */
import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/AppError";

export const PUBLIC_VERIFY_RATE_LIMIT = { windowMs: 60_000, max: 20 } as const;
export const RATE_LIMIT_MAX_KEYS = 10_000;

type Hit = { count: number; resetAt: number };

export function clientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

export function pruneRateLimitHits(
  hits: Map<string, Hit>,
  now: number,
  maxKeys = RATE_LIMIT_MAX_KEYS,
): void {
  for (const [key, value] of hits) {
    if (value.resetAt <= now) hits.delete(key);
  }
  if (hits.size <= maxKeys) return;
  const overflow = hits.size - maxKeys;
  const oldest = [...hits.entries()].sort((left, right) => left[1].resetAt - right[1].resetAt);
  for (let i = 0; i < overflow; i += 1) {
    const key = oldest[i]?.[0];
    if (key) hits.delete(key);
  }
}

export function rateLimit(options: { windowMs: number; max: number }): (
  req: Request,
  _res: Response,
  next: NextFunction,
) => void {
  const hits = new Map<string, Hit>();

  return (req: Request, _res: Response, next: NextFunction): void => {
    const ip = clientIp(req);
    const now = Date.now();
    pruneRateLimitHits(hits, now);

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
