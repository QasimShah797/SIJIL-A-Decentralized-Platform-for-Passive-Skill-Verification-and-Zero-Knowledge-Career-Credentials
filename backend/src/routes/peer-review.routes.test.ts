import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { NextFunction, Request, Response } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { requireLearner } from "../middleware/role.middleware";
import { ROLES } from "../constants/roles";
import { AppError } from "../utils/AppError";
import { getRequestSupabase, getServiceSupabase } from "../config/supabase";
import { peerReviewService } from "../services/peer-review.service";
import peerReviewRoutes from "./peer-review.routes";

type RouteLayer = {
  handle: Function;
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: Function }>;
  };
};

function layers(): RouteLayer[] {
  return (peerReviewRoutes as unknown as { stack: RouteLayer[] }).stack;
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
    setHeader() {
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

describe("peer-review routes", () => {
  it("leaves invitation and submission public and protects learner routes", () => {
    const stack = layers();
    const authIndex = stack.findIndex((layer) => layer.handle === authMiddleware);
    const learnerIndex = stack.findIndex((layer) => layer.handle === requireLearner);
    const inviteIndex = stack.findIndex((layer) => layer.route?.path === "/invite/:token");
    const submitIndex = stack.findIndex((layer) => layer.route?.path === "/submit");
    const reviewsIndex = stack.findIndex((layer) => layer.route?.path === "/reviews");

    assert.ok(authIndex >= 0);
    assert.ok(learnerIndex >= 0);
    assert.ok(inviteIndex >= 0 && inviteIndex < authIndex);
    assert.ok(submitIndex >= 0 && submitIndex < authIndex);
    assert.ok(reviewsIndex > authIndex);

    for (const path of ["/invite/:token", "/submit"]) {
      const handles = routeHandles(path === "/submit" ? "post" : "get", path);
      assert.equal(handles.includes(authMiddleware), false);
      assert.equal(handles.includes(requireLearner), false);
    }

    for (const [method, path] of [
      ["get", "/projects"],
      ["get", "/reviews"],
      ["get", "/project/:id/contributors"],
      ["post", "/invite"],
      ["post", "/invitations/:id/resend"],
      ["get", "/stats"],
    ] as const) {
      assert.ok(routeHandles(method, path).length > 0);
    }
  });

  it("runs authenticated learner reads inside the learner database session", async () => {
    const original = peerReviewService.getReviewsForUser.bind(peerReviewService);
    let seenServiceClient = false;
    peerReviewService.getReviewsForUser = (async () => {
      seenServiceClient = getRequestSupabase() === getServiceSupabase();
      return [];
    }) as typeof peerReviewService.getReviewsForUser;

    try {
      const handle = routeHandles("get", "/reviews").at(-1);
      assert.ok(handle);
      const response = mockResponse();
      await handle(
        { accessToken: "learner-session-token", user: { id: "learner-1" }, params: {}, body: {} } as unknown as Request,
        response as unknown as Response,
        () => undefined,
      );
      assert.equal(seenServiceClient, false);
      assert.equal(response.statusCode, 200);
    } finally {
      peerReviewService.getReviewsForUser = original as typeof peerReviewService.getReviewsForUser;
    }
  });

  it("does not switch the public invitation lookup into a learner session", async () => {
    const original = peerReviewService.getInviteByToken.bind(peerReviewService);
    let seenServiceClient = false;
    peerReviewService.getInviteByToken = (async () => {
      seenServiceClient = getRequestSupabase() === getServiceSupabase();
      return { token: "public-token" };
    }) as unknown as typeof peerReviewService.getInviteByToken;

    try {
      const handle = routeHandles("get", "/invite/:token").at(-1);
      assert.ok(handle);
      const response = mockResponse();
      await handle(
        { params: { token: "public-token" }, body: {} } as unknown as Request,
        response as unknown as Response,
        () => undefined,
      );
      assert.equal(seenServiceClient, true);
      assert.equal(response.statusCode, 200);
    } finally {
      peerReviewService.getInviteByToken = original as typeof peerReviewService.getInviteByToken;
    }
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

  it("requires a learner role on authenticated learner routes", () => {
    assert.throws(
      () => requireLearner({} as Request, mockResponse() as unknown as Response, () => undefined),
      (error: unknown) => error instanceof AppError && error.statusCode === 401,
    );
    assert.throws(
      () => requireLearner(
        { user: { id: "recruiter-1" }, userRoles: [ROLES.RECRUITER] } as unknown as Request,
        mockResponse() as unknown as Response,
        () => undefined,
      ),
      (error: unknown) => error instanceof AppError && error.statusCode === 403,
    );

    let continued = false;
    requireLearner(
      { user: { id: "learner-1" }, userRoles: [ROLES.LEARNER] } as unknown as Request,
      mockResponse() as unknown as Response,
      () => {
        continued = true;
      },
    );
    assert.equal(continued, true);
  });

  it("reads reviews for the authenticated learner rather than a requested user id", async () => {
    const original = peerReviewService.getReviewsForUser.bind(peerReviewService);
    let seenUserId = "";
    peerReviewService.getReviewsForUser = (async (userId: string) => {
      seenUserId = userId;
      return [];
    }) as typeof peerReviewService.getReviewsForUser;

    try {
      const handle = routeHandles("get", "/reviews").at(-1);
      assert.ok(handle);
      const response = mockResponse();
      await handle(
        {
          accessToken: "learner-session-token",
          user: { id: "learner-a" },
          params: {},
          query: { userId: "learner-b" },
          body: { userId: "learner-b" },
        } as unknown as Request,
        response as unknown as Response,
        () => undefined,
      );
      assert.equal(seenUserId, "learner-a");
      assert.equal(response.statusCode, 200);
    } finally {
      peerReviewService.getReviewsForUser = original as typeof peerReviewService.getReviewsForUser;
    }
  });

  it("uses the invitation path token and rejects a submission without one", async () => {
    const originalInvite = peerReviewService.getInviteByToken.bind(peerReviewService);
    const originalSubmit = peerReviewService.submitReview.bind(peerReviewService);
    let seenToken = "";
    let submitCalled = false;
    peerReviewService.getInviteByToken = (async (token: string) => {
      seenToken = token;
      return { token };
    }) as unknown as typeof peerReviewService.getInviteByToken;
    peerReviewService.submitReview = (async () => {
      submitCalled = true;
      return {};
    }) as unknown as typeof peerReviewService.submitReview;

    try {
      const invite = routeHandles("get", "/invite/:token").at(-1);
      const submit = routeHandles("post", "/submit").at(-1);
      assert.ok(invite);
      assert.ok(submit);
      const pathToken = "a".repeat(32);
      await invite(
        { params: { token: pathToken }, body: { token: "b".repeat(32) } } as unknown as Request,
        mockResponse() as unknown as Response,
        () => undefined,
      );
      assert.equal(seenToken, pathToken);

      const rejected = await Promise.all([
        { params: {}, body: { rating: 5, feedback: "Observed the work", recommendation: "Recommended" } },
        {
          params: {},
          body: {
            token: "short-token",
            rating: 5,
            feedback: "Observed the work",
            recommendation: "Recommended",
            reviewerEmail: "reviewer@example.com",
          },
        },
      ].map((request) => new Promise<unknown>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("submission handler did not reject")), 1000);
        submit(
          request as unknown as Request,
          mockResponse() as unknown as Response,
          ((error?: unknown) => {
            clearTimeout(timer);
            resolve(error);
          }) as NextFunction,
        );
      })));
      assert.equal(rejected.length, 2);
      assert.ok(rejected.every((error) => error instanceof Error));
      assert.equal(submitCalled, false);
    } finally {
      peerReviewService.getInviteByToken = originalInvite as typeof peerReviewService.getInviteByToken;
      peerReviewService.submitReview = originalSubmit as typeof peerReviewService.submitReview;
    }
  });
});
