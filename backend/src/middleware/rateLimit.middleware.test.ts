import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/AppError";
import { PUBLIC_VERIFY_RATE_LIMIT, pruneRateLimitHits, rateLimit } from "./rateLimit.middleware";

function mockReq(ip: string, forwarded?: string): Request {
  return {
    ip,
    headers: forwarded ? { "x-forwarded-for": forwarded } : {},
    socket: { remoteAddress: ip },
  } as Request;
}

describe("public verify rate limit", () => {
  it("is a low per-IP cap (20 requests per minute)", () => {
    assert.equal(PUBLIC_VERIFY_RATE_LIMIT.windowMs, 60_000);
    assert.equal(PUBLIC_VERIFY_RATE_LIMIT.max, 20);
  });

  it("returns 429 after the per-IP max in the window", () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 2 });
    const errors: unknown[] = [];
    const next: NextFunction = (err?: unknown) => {
      if (err) errors.push(err);
    };
    const res = {} as Response;
    limiter(mockReq("1.1.1.1"), res, next);
    limiter(mockReq("1.1.1.1"), res, next);
    limiter(mockReq("1.1.1.1"), res, next);
    limiter(mockReq("2.2.2.2"), res, next);
    assert.equal(errors.length, 1);
    assert.ok(errors[0] instanceof AppError);
    assert.equal((errors[0] as AppError).statusCode, 429);
  });

  it("does not let a spoofed X-Forwarded-For bypass the limit when TRUST_PROXY is off", () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 2 });
    const errors: unknown[] = [];
    const next: NextFunction = (err?: unknown) => {
      if (err) errors.push(err);
    };
    const res = {} as Response;
    limiter(mockReq("10.0.0.1", "203.0.113.1"), res, next);
    limiter(mockReq("10.0.0.1", "203.0.113.2"), res, next);
    limiter(mockReq("10.0.0.1", "203.0.113.3"), res, next);
    assert.equal(errors.length, 1);
    assert.ok(errors[0] instanceof AppError);
    assert.equal((errors[0] as AppError).statusCode, 429);
  });

  it("prunes expired keys and caps the map", () => {
    const hits = new Map<string, { count: number; resetAt: number }>([
      ["old", { count: 1, resetAt: 10 }],
      ["live", { count: 1, resetAt: 100 }],
      ["also", { count: 1, resetAt: 90 }],
    ]);
    pruneRateLimitHits(hits, 50, 1);
    assert.equal(hits.has("old"), false);
    assert.equal(hits.size, 1);
  });
});
