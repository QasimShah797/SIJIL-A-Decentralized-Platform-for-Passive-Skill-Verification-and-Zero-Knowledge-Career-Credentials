import { describe, expect, it, vi } from "vitest";
import {
  ACTIVE_MOODLE_SYNC_ACTIONS,
  bodyAttemptsIdentityOverride,
  buildMoodleSyncCorsHeaders,
  buildSafeMoodleTestResponse,
  DEFAULT_MOODLE_SYNC_CORS_ORIGINS,
  DISABLED_MOODLE_DEBUG_ACTIONS,
  disabledDebugActionPayload,
  isAccessControlError,
  isActiveMoodleSyncAction,
  isDisabledMoodleDebugAction,
  normalizeMoodleSyncAction,
  parseMoodleSyncCorsOrigins,
  resolveMoodleSyncCorsAllowOrigin,
  responseContainsSecretMetadata,
} from "../../supabase/functions/moodle-sync/moodle-sync-security.ts";

/**
 * Mirrors moodle-sync/index.ts routing order for security assertions
 * without importing Deno-only modules.
 */
async function routeMoodleSyncAction(params: {
  action: unknown;
  body?: Record<string, unknown>;
  auth: "missing" | "invalid" | "ok";
  callMoodle: (wsfunction: string) => Promise<Record<string, unknown>>;
  runSync: () => Promise<"synced">;
  runRepair: () => Promise<"repaired">;
}): Promise<{ status: number; body: Record<string, unknown>; moodleCalls: string[] }> {
  const moodleCalls: string[] = [];
  const action = normalizeMoodleSyncAction(params.action);
  const body = params.body ?? {};

  if (isDisabledMoodleDebugAction(action)) {
    return { status: 410, body: disabledDebugActionPayload(action), moodleCalls };
  }

  const requireAuth = () => {
    if (params.auth === "missing" || params.auth === "invalid") {
      return { error: true as const, status: 401, body: { error: "Unauthorized" } };
    }
    return {
      error: false as const,
      userId: "jwt-user-id",
      authEmail: "learner@example.com",
    };
  };

  if (action === "test") {
    const auth = requireAuth();
    if (auth.error) return { status: auth.status, body: auth.body, moodleCalls };
    moodleCalls.push("core_webservice_get_site_info");
    const siteInfo = await params.callMoodle("core_webservice_get_site_info");
    return {
      status: 200,
      body: buildSafeMoodleTestResponse({ siteInfo }),
      moodleCalls,
    };
  }

  if (action === "sync_moodle_data" || action === "sync_activities") {
    const auth = requireAuth();
    if (auth.error) return { status: auth.status, body: auth.body, moodleCalls };
    // Identity from JWT only — body overrides are detected but ignored.
    expect(auth.userId).toBe("jwt-user-id");
    expect(auth.authEmail).toBe("learner@example.com");
    void bodyAttemptsIdentityOverride(body);
    await params.runSync();
    return {
      status: 200,
      body: {
        success: true,
        action,
        userId: auth.userId,
        supportedActions: [...ACTIVE_MOODLE_SYNC_ACTIONS],
      },
      moodleCalls,
    };
  }

  if (action === "repair_moodle_evidence_records") {
    const auth = requireAuth();
    if (auth.error) return { status: auth.status, body: auth.body, moodleCalls };
    await params.runRepair();
    return {
      status: 200,
      body: { success: true, action, userId: auth.userId },
      moodleCalls,
    };
  }

  return {
    status: 400,
    body: { code: "INVALID_ACTION", normalized: action },
    moodleCalls,
  };
}

describe("moodle-sync security helpers", () => {
  it("normalizes sync and repair aliases to active actions", () => {
    expect(normalizeMoodleSyncAction("sync_moodle_data")).toBe("sync_moodle_data");
    expect(normalizeMoodleSyncAction("refresh_moodle_data")).toBe("sync_moodle_data");
    expect(normalizeMoodleSyncAction("sync")).toBe("sync_activities");
    expect(normalizeMoodleSyncAction("sync_moodle_activities")).toBe("sync_activities");
    expect(normalizeMoodleSyncAction("repair_moodle_evidence")).toBe(
      "repair_moodle_evidence_records",
    );
    expect(isActiveMoodleSyncAction("sync_activities")).toBe(true);
    expect(isActiveMoodleSyncAction("get_grades")).toBe(false);
  });

  it("flags disabled debug actions", () => {
    for (const action of DISABLED_MOODLE_DEBUG_ACTIONS) {
      expect(isDisabledMoodleDebugAction(action)).toBe(true);
    }
    expect(isDisabledMoodleDebugAction("test")).toBe(false);
    expect(isDisabledMoodleDebugAction("sync_moodle_data")).toBe(false);
  });

  it("detects body identity override attempts without accepting them", () => {
    expect(bodyAttemptsIdentityOverride({})).toBe(false);
    expect(bodyAttemptsIdentityOverride({ force: true })).toBe(false);
    expect(bodyAttemptsIdentityOverride({ userId: "attacker" })).toBe(true);
    expect(bodyAttemptsIdentityOverride({ email: "victim@example.com" })).toBe(true);
    expect(bodyAttemptsIdentityOverride({ auth_email: "x" })).toBe(true);
  });

  it("treats Moodle grade-view permission errors as access control soft-fails", () => {
    expect(isAccessControlError("Cannot view grades.", "nopermissiontoviewgrades")).toBe(true);
    expect(isAccessControlError("Access denied", "accessdenied")).toBe(true);
    expect(isAccessControlError("No completion criteria set", "nocriteriaset")).toBe(false);
  });

  it("allowlists local frontend origins and never returns *", () => {
    expect(parseMoodleSyncCorsOrigins("")).toEqual([...DEFAULT_MOODLE_SYNC_CORS_ORIGINS]);
    expect(parseMoodleSyncCorsOrigins(" http://localhost:8080 , http://127.0.0.1:8080 ")).toEqual([
      "http://localhost:8080",
      "http://127.0.0.1:8080",
    ]);
    expect(
      resolveMoodleSyncCorsAllowOrigin("http://localhost:8080", DEFAULT_MOODLE_SYNC_CORS_ORIGINS),
    ).toBe("http://localhost:8080");
    expect(
      resolveMoodleSyncCorsAllowOrigin("https://evil.example", DEFAULT_MOODLE_SYNC_CORS_ORIGINS),
    ).toBeNull();
    expect(resolveMoodleSyncCorsAllowOrigin(null, DEFAULT_MOODLE_SYNC_CORS_ORIGINS)).toBeNull();

    const allowed = buildMoodleSyncCorsHeaders("http://127.0.0.1:8080");
    expect(allowed["Access-Control-Allow-Origin"]).toBe("http://127.0.0.1:8080");
    expect(allowed["Access-Control-Allow-Headers"]).toMatch(/authorization/i);
    expect(allowed["Access-Control-Allow-Methods"]).toMatch(/POST/);
    expect(Object.values(allowed).join(" ")).not.toContain("*");

    const blocked = buildMoodleSyncCorsHeaders("https://evil.example");
    expect(blocked["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  it("builds a safe authenticated test response without secret metadata", () => {
    const payload = buildSafeMoodleTestResponse({
      siteInfo: {
        sitename: "Local Moodle",
        username: "sijil_service",
        userid: 2,
        functions: [{ name: "core_user_get_users" }],
      },
    });

    expect(payload.success).toBe(true);
    expect(payload.ok).toBe(true);
    expect(payload.authenticated).toBe(true);
    expect(payload.sitename).toBe("Local Moodle");
    expect(payload.siteInfo).toEqual({ sitename: "Local Moodle" });
    expect(payload.supportedActions).toEqual([...ACTIVE_MOODLE_SYNC_ACTIONS]);
    expect(responseContainsSecretMetadata(payload)).toBe(false);
    expect(JSON.stringify(payload)).not.toMatch(/token/i);
    expect(JSON.stringify(payload)).not.toContain("moodleEnv");
    expect(JSON.stringify(payload)).not.toContain("tokenLength");
    expect(JSON.stringify(payload)).not.toContain("sijil_service");
  });
});

describe("moodle-sync action routing security", () => {
  it("rejects missing/invalid authentication before any Moodle call for test", async () => {
    const callMoodle = vi.fn(async () => ({ sitename: "Local Moodle" }));

    const missing = await routeMoodleSyncAction({
      action: "test",
      auth: "missing",
      callMoodle,
      runSync: async () => "synced",
      runRepair: async () => "repaired",
    });
    expect(missing.status).toBe(401);
    expect(missing.moodleCalls).toEqual([]);
    expect(callMoodle).not.toHaveBeenCalled();

    const invalid = await routeMoodleSyncAction({
      action: "test",
      auth: "invalid",
      callMoodle,
      runSync: async () => "synced",
      runRepair: async () => "repaired",
    });
    expect(invalid.status).toBe(401);
    expect(invalid.moodleCalls).toEqual([]);
    expect(callMoodle).not.toHaveBeenCalled();
  });

  it("returns 410 for disabled debug actions without Moodle calls", async () => {
    const callMoodle = vi.fn(async () => ({ sitename: "Local Moodle" }));

    for (const action of DISABLED_MOODLE_DEBUG_ACTIONS) {
      const result = await routeMoodleSyncAction({
        action,
        auth: "missing",
        body: { moodleUserId: 3, email: "anyone@example.com", courseId: 2 },
        callMoodle,
        runSync: async () => "synced",
        runRepair: async () => "repaired",
      });
      expect(result.status).toBe(410);
      expect(result.body.code).toBe("ACTION_GONE");
      expect(result.moodleCalls).toEqual([]);
    }
    expect(callMoodle).not.toHaveBeenCalled();
  });

  it("allows authenticated test and returns only safe connection fields", async () => {
    const callMoodle = vi.fn(async () => ({
      sitename: "Local Moodle",
      userid: 99,
      username: "sijil_service",
    }));

    const result = await routeMoodleSyncAction({
      action: "test",
      auth: "ok",
      callMoodle,
      runSync: async () => "synced",
      runRepair: async () => "repaired",
    });

    expect(result.status).toBe(200);
    expect(result.moodleCalls).toEqual(["core_webservice_get_site_info"]);
    expect(callMoodle).toHaveBeenCalledTimes(1);
    expect(result.body.sitename).toBe("Local Moodle");
    expect(responseContainsSecretMetadata(result.body)).toBe(false);
    expect(result.body).not.toHaveProperty("moodleEnv");
  });

  it("routes authenticated sync actions and ignores body identity overrides", async () => {
    const callMoodle = vi.fn(async () => ({ sitename: "Local Moodle" }));
    const runSync = vi.fn(async () => "synced" as const);

    const result = await routeMoodleSyncAction({
      action: "sync_moodle_data",
      auth: "ok",
      body: {
        userId: "attacker-id",
        email: "victim@example.com",
        force: true,
      },
      callMoodle,
      runSync,
      runRepair: async () => "repaired",
    });

    expect(result.status).toBe(200);
    expect(result.body.userId).toBe("jwt-user-id");
    expect(result.body.userId).not.toBe("attacker-id");
    expect(runSync).toHaveBeenCalledTimes(1);
    expect(callMoodle).not.toHaveBeenCalled();
  });

  it("requires auth for sync before any sync/Moodle work", async () => {
    const callMoodle = vi.fn(async () => ({ sitename: "Local Moodle" }));
    const runSync = vi.fn(async () => "synced" as const);

    const result = await routeMoodleSyncAction({
      action: "sync_activities",
      auth: "missing",
      callMoodle,
      runSync,
      runRepair: async () => "repaired",
    });

    expect(result.status).toBe(401);
    expect(runSync).not.toHaveBeenCalled();
    expect(callMoodle).not.toHaveBeenCalled();
  });
});
