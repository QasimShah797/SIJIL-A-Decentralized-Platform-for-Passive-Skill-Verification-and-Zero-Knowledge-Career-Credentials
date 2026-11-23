import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { authMiddleware } from "../middleware/auth.middleware";
import { requireAdmin } from "../middleware/role.middleware";
import googleCalendarRoutes from "./google-calendar.routes";

type RouteLayer = {
  handle: Function;
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: Function }>;
  };
};

function layers(): RouteLayer[] {
  return (googleCalendarRoutes as unknown as { stack: RouteLayer[] }).stack;
}

function routeHandles(method: string, path: string): Function[] {
  const layer = layers().find((entry) => entry.route?.path === path && entry.route.methods[method]);
  assert.ok(layer?.route, `${method.toUpperCase()} ${path} is mounted`);
  return layer.route.stack.map((entry) => entry.handle);
}

describe("google-calendar routes", () => {
  it("leaves the OAuth callback public and protects connect/status/disconnect with admin auth", () => {
    const callbackHandles = routeHandles("get", "/callback");
    assert.equal(callbackHandles.includes(authMiddleware), false);
    assert.equal(callbackHandles.includes(requireAdmin), false);

    for (const [method, path] of [
      ["get", "/connect"],
      ["get", "/status"],
      ["delete", "/disconnect"],
    ] as const) {
      const handles = routeHandles(method, path);
      assert.equal(handles.includes(authMiddleware), true, `${method} ${path} auth`);
      assert.equal(handles.includes(requireAdmin), true, `${method} ${path} admin`);
    }
  });
});
