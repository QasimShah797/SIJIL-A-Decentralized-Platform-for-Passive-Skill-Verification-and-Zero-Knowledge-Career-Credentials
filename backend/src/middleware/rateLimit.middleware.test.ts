import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/AppError";
import { PUBLIC_VERIFY_RATE_LIMIT, rateLimit } from "./rateLimit.middleware";

function mockReq(ip: string, forwarded?: string): Request {
  return {
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
});
