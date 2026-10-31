import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { NextFunction, Request, Response } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { requireLearner, requireRecruiter } from "../middleware/role.middleware";
import { AppError } from "../utils/AppError";
import { evaluateGitHubZkp, requestGitHubProof } from "../controllers/github-zkp.controller";
import { evaluateAssessmentZkp } from "../controllers/zkp.controller";
import zkpRoutes, { githubProofRateLimit } from "./zkp.routes";
import recruiterRoutes from "./recruiter.routes";

type RouteLayer = {
  handle: Function;
  route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Function }> };
};

function handles(router: { stack: RouteLayer[] }, method: string, path: string): Function[] {
  const layer = router.stack.find((entry) => entry.route?.path === path && entry.route.methods[method]);
  assert.ok(layer?.route, `${method} ${path} is mounted`);
  return layer.route.stack.map((entry) => entry.handle);
}

describe("GitHub ZKP routes", () => {
  it("requires learner authentication on proof and evaluate routes", () => {
    const stack = (zkpRoutes as unknown as { stack: RouteLayer[] }).stack;
    for (const path of [
      "/types",
      "/status",
      "/github/evidence",
      "/github/snapshots",
      "/github/evaluate",
      "/github/proofs",
      "/github/proofs/:proofId",
      "/github/disclosures",
      "/assessment/evaluate",
    ]) {
      const layer = stack.find((entry) => entry.route?.path === path);
      assert.ok(layer?.route, path);
      const routeHandles = layer.route.stack.map((entry) => entry.handle);
      assert.equal(routeHandles.includes(authMiddleware), true);
      assert.equal(routeHandles.includes(requireLearner), true);
    }
  });

  it("requires recruiter authentication for disclosure verification", () => {
    const stack = (recruiterRoutes as unknown as { stack: RouteLayer[] }).stack;
    assert.equal(stack.some((entry) => entry.handle === authMiddleware), true);
    assert.equal(stack.some((entry) => entry.handle === requireRecruiter), true);
    assert.ok(handles(recruiterRoutes as unknown as { stack: RouteLayer[] }, "post", "/github-zkp/verify").length > 0);
    assert.ok(handles(recruiterRoutes as unknown as { stack: RouteLayer[] }, "post", "/github-zkp/policy/verify").length > 0);
    assert.ok(handles(recruiterRoutes as unknown as { stack: RouteLayer[] }, "post", "/zkp/policy/verify").length > 0);
  });

  it("rejects a missing Authorization header", async () => {
    const error = await new Promise<unknown>((resolve) => {
      void authMiddleware({ headers: {} } as Request, {} as Response, ((err?: unknown) => resolve(err)) as NextFunction);
    });
    assert.ok(error instanceof AppError);
    assert.equal(error.statusCode, 401);
  });

  it("rejects client-supplied thresholds on the deprecated proofs path", async () => {
    await assert.rejects(
      () => requestGitHubProof({
        user: { id: "123e4567-e89b-42d3-a456-426614174000" },
        body: {
          snapshotId: "223e4567-e89b-42d3-a456-426614174000",
          threshold: 10,
          count: 100,
          blinding: "1",
          commitment: "2",
        },
      } as Request, {} as Response),
      (error: unknown) => error instanceof AppError && error.statusCode === 400,
    );
  });

  it("retires learner-triggered GitHub and assessment evaluation", async () => {
    const req = { user: { id: "123e4567-e89b-42d3-a456-426614174000" }, body: { repositoryFullName: "octo/demo", threshold: 1 } } as Request;
    for (const handler of [evaluateGitHubZkp, evaluateAssessmentZkp]) {
      await assert.rejects(
        () => handler(req, {} as Response),
        (error: unknown) => error instanceof AppError && error.statusCode === 410,
      );
    }
  });

  it("rate limits repeated proof requests for the same learner", () => {
    const req = { user: { id: "rate-limit-learner-routes" }, ip: "127.0.0.1" } as Request;
    const res = {} as Response;
    let blocked = 0;
    const next: NextFunction = (error?: unknown) => {
      if (error instanceof AppError && error.statusCode === 429) blocked += 1;
    };
    githubProofRateLimit(req, res, next);
    githubProofRateLimit(req, res, next);
    githubProofRateLimit(req, res, next);
    assert.equal(blocked, 1);
  });
});
