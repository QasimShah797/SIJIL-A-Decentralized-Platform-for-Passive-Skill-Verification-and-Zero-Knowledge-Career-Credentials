import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { REVIEWER_ROLES, requireLearner, requireRecruiter } from "./role.middleware";
import { ROLES } from "../constants/roles";
import { AppError } from "../utils/AppError";

describe("reviewer role guard", () => {
  it("allows reviewer, legacy institution, and admin", () => {
    assert.deepEqual(REVIEWER_ROLES, [ROLES.REVIEWER, ROLES.INSTITUTION, ROLES.ADMIN]);
  });
});

describe("requireLearner email confirmation", () => {
  it("denies unverified learners", () => {
    const req = {
      user: {
        id: "u1",
        email_confirmed_at: null,
        identities: [{ provider: "email" }],
      },
      userRoles: [ROLES.LEARNER],
    } as unknown as Request;
    let captured: unknown;
    requireLearner(req, {} as Response, (err?: unknown) => {
      captured = err;
    });
    assert.ok(captured instanceof AppError);
    assert.match((captured as AppError).message, /email verification required/i);
  });

  it("allows verified learners", () => {
    const req = {
      user: {
        id: "u1",
        email_confirmed_at: "2026-01-01T00:00:00Z",
        identities: [{ provider: "email" }],
      },
      userRoles: [ROLES.LEARNER],
    } as unknown as Request;
    let called = false;
    requireLearner(req, {} as Response, (err?: unknown) => {
      assert.equal(err, undefined);
      called = true;
    });
    assert.equal(called, true);
  });

  it("does not apply email confirmation to recruiter middleware", () => {
    const req = {
      user: {
        id: "r1",
        email_confirmed_at: null,
        identities: [{ provider: "email" }],
      },
      userRoles: [ROLES.RECRUITER],
    } as unknown as Request;
    let called = false;
    requireRecruiter(req, {} as Response, () => {
      called = true;
    });
    assert.equal(called, true);
  });
});
