import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "../config/env";
import { getRequestSupabase, getServiceSupabase, runWithUserDb } from "../config/supabase";
import { supabaseService } from "./supabase.service";

function clientKey(client: SupabaseClient): string {
  return (client as SupabaseClient & { supabaseKey?: string }).supabaseKey ?? "";
}

function authorization(client: SupabaseClient): string | null {
  const headers = (client as SupabaseClient & { rest?: { headers?: { get?: (name: string) => string | null } } }).rest?.headers;
  return headers?.get?.("authorization") ?? null;
}

describe("database client selection", () => {
  it("keeps the service-role client when a distinct service key is configured", async () => {
    const originalRole = env.SUPABASE_SERVICE_ROLE_KEY;
    const originalAnon = env.SUPABASE_ANON_KEY;
    env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
    env.SUPABASE_ANON_KEY = "anon-test-key";
    try {
      assert.equal(supabaseService.client, getServiceSupabase());
      await runWithUserDb("learner-session-token", async () => {
        assert.equal(supabaseService.client, getServiceSupabase());
        assert.notEqual(getRequestSupabase(), getServiceSupabase());
      });
    } finally {
      env.SUPABASE_SERVICE_ROLE_KEY = originalRole;
      env.SUPABASE_ANON_KEY = originalAnon;
    }
  });

  it("uses the learner session only when the service key falls back to the anon key", async () => {
    const originalRole = env.SUPABASE_SERVICE_ROLE_KEY;
    const originalAnon = env.SUPABASE_ANON_KEY;
    env.SUPABASE_ANON_KEY = "shared-fallback-key";
    env.SUPABASE_SERVICE_ROLE_KEY = "shared-fallback-key";
    try {
      assert.equal(supabaseService.client, getServiceSupabase());
      await runWithUserDb("learner-session-token", async () => {
        assert.equal(supabaseService.client, getRequestSupabase());
        assert.notEqual(supabaseService.client, getServiceSupabase());
      });
      assert.equal(supabaseService.client, getServiceSupabase());
    } finally {
      env.SUPABASE_SERVICE_ROLE_KEY = originalRole;
      env.SUPABASE_ANON_KEY = originalAnon;
    }
  });

  it("keeps the anon-key fallback on the learner key and bearer token", async () => {
    const originalRole = env.SUPABASE_SERVICE_ROLE_KEY;
    const originalAnon = env.SUPABASE_ANON_KEY;
    const cachedServiceKey = clientKey(getServiceSupabase());
    env.SUPABASE_ANON_KEY = "shared-fallback-key";
    env.SUPABASE_SERVICE_ROLE_KEY = "shared-fallback-key";
    try {
      await runWithUserDb("learner-session-token", async () => {
        const client = supabaseService.client;
        assert.equal(clientKey(client), "shared-fallback-key");
        assert.equal(authorization(client), "Bearer learner-session-token");
        assert.notEqual(client, getServiceSupabase());
        if (cachedServiceKey !== "shared-fallback-key") {
          assert.notEqual(clientKey(client), cachedServiceKey);
        }
      });
    } finally {
      env.SUPABASE_SERVICE_ROLE_KEY = originalRole;
      env.SUPABASE_ANON_KEY = originalAnon;
    }
  });

  it("does not leak a request database session into another request", async () => {
    const seen: string[] = [];
    await Promise.all([
      runWithUserDb("token-a", async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        seen[0] = authorization(getRequestSupabase()) ?? "";
      }),
      runWithUserDb("token-b", async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        seen[1] = authorization(getRequestSupabase()) ?? "";
      }),
    ]);
    assert.deepEqual(seen, ["Bearer token-a", "Bearer token-b"]);
    assert.equal(getRequestSupabase(), getServiceSupabase());
  });
});
