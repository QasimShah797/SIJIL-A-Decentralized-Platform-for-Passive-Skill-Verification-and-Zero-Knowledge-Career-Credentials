/**
 * Learner journey route guards — no live Supabase/Fabric.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { authMiddleware } from "../middleware/auth.middleware";
import { requireLearner } from "../middleware/role.middleware";
import { ROLES } from "../constants/roles";
import { AppError } from "../utils/AppError";
import { getRequestSupabase, getServiceSupabase } from "../config/supabase";
import { learnerJourneyService } from "../services/learner-journey.service";
import learnerRoutes from "./learner.routes";

type RouteLayer = {
  handle: Function;
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: Function }>;
  };
};

function layers(): RouteLayer[] {
  return (learnerRoutes as unknown as { stack: RouteLayer[] }).stack;
}

function routeHandles(method: string, path: string): Function[] {
  const layer = layers().find((entry) => entry.route?.path === path && entry.route.methods[method]);
  assert.ok(layer?.route, `${method} ${path} is mounted`);
  return layer.route.stack.map((entry) => entry.handle);
}

function mockResponse() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    setHeader(name: string, value: string) {
      this.headers[name] = value;
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}

describe("learner journey routes", () => {
  it("mounts GET /journey behind authMiddleware and requireLearner", () => {
    const stack = layers();
    const authIndex = stack.findIndex((layer) => layer.handle === authMiddleware);
    const learnerIndex = stack.findIndex((layer) => layer.handle === requireLearner);
    const journeyIndex = stack.findIndex((layer) => layer.route?.path === "/journey");

    assert.ok(authIndex >= 0);
    assert.ok(learnerIndex >= 0);
    assert.ok(journeyIndex > learnerIndex);
    assert.ok(routeHandles("get", "/journey").length > 0);
  });

  it("rejects unauthenticated callers through requireLearner when user is missing", () => {
    assert.throws(
      () => requireLearner({} as Request, mockResponse() as unknown as Response, () => undefined),
      (err: unknown) => err instanceof AppError && err.statusCode === 401,
    );
  });

  it("rejects recruiter-only callers for requireLearner", () => {
    assert.throws(
      () => requireLearner(
        { user: { id: "recruiter-1" }, userRoles: [ROLES.RECRUITER] } as unknown as Request,
        mockResponse() as unknown as Response,
        () => undefined,
      ),
      (err: unknown) => err instanceof AppError && err.statusCode === 403,
    );
  });

  it("allows learner role through requireLearner", () => {
    let nextCalled = false;
    requireLearner(
      { user: { id: "learner-1" }, userRoles: [ROLES.LEARNER] } as unknown as Request,
      mockResponse() as unknown as Response,
      (() => {
        nextCalled = true;
      }) as NextFunction,
    );
    assert.equal(nextCalled, true);
  });

  it("rejects a missing bearer token before any database lookup", async () => {
    const error = await new Promise<unknown>((resolve) => {
      void authMiddleware(
        { headers: {} } as Request,
        mockResponse() as unknown as Response,
        ((err?: unknown) => resolve(err)) as NextFunction,
      );
    });
    assert.ok(error instanceof AppError);
    assert.equal(error.statusCode, 401);
  });

  it("uses authenticated user id and RLS-bound session for journey reads", async () => {
    const original = learnerJourneyService.getJourney;
    let seenLearnerId = "";
    let seenServiceClient = false;

    learnerJourneyService.getJourney = (async (learnerUserId) => {
      seenLearnerId = learnerUserId;
      seenServiceClient = getRequestSupabase() === getServiceSupabase();
      return {
        schemaVersion: 1 as const,
        generatedAt: "2026-11-03T00:00:00.000Z",
        learnerUserId,
        disclaimers: {
          absenceOfEvidenceNotAbsenceOfSkill: true as const,
          sourceReportedIsNotSkillAssessed: true as const,
        },
        events: [],
        skillGrowth: [],
        page: {
          limit: 50,
          nextCursor: null,
          truncatedSources: [],
          incomplete: false,
        },
      };
    }) as typeof learnerJourneyService.getJourney;

    try {
      const handle = routeHandles("get", "/journey").at(-1);
      assert.ok(handle);
      const response = mockResponse();
      await handle(
        {
          accessToken: "learner-session-token",
          user: { id: "11111111-1111-4111-8111-111111111111" },
          query: {},
          params: {},
          body: {},
        } as unknown as Request,
        response as unknown as Response,
        () => undefined,
      );
      assert.equal(seenLearnerId, "11111111-1111-4111-8111-111111111111");
      assert.equal(seenServiceClient, false);
      assert.equal(response.statusCode, 200);
      const body = response.body as { success: boolean; data: { learnerUserId: string } };
      assert.equal(body.success, true);
      assert.equal(body.data.learnerUserId, "11111111-1111-4111-8111-111111111111");
    } finally {
      learnerJourneyService.getJourney = original;
    }
  });

  it("rejects invalid query parameters with Zod before service work", async () => {
    const handle = routeHandles("get", "/journey").at(-1);
    assert.ok(handle);
    const response = mockResponse();
    const error = await new Promise<unknown>((resolve) => {
      void handle(
        {
          accessToken: "token",
          user: { id: "11111111-1111-4111-8111-111111111111" },
          query: { limit: "999" },
          params: {},
          body: {},
        } as unknown as Request,
        response as unknown as Response,
        ((err?: unknown) => resolve(err)) as NextFunction,
      );
    });
    assert.ok(error instanceof ZodError);
  });
});
