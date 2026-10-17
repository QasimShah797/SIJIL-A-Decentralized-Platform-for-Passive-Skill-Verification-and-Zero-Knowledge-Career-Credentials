import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { env } from "../config/env";
import { getRequestSupabase, getServiceSupabase, runWithUserDb } from "../config/supabase";
import { supabaseService } from "./supabase.service";

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
});
