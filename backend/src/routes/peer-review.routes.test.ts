import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { requireLearner } from "../middleware/role.middleware";
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
});
