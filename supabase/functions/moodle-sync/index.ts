import {
  callMoodle,
  corsHeaders,
  getExpectedMoodleSiteUrl,
  json,
  logSyncStage,
  MoodleSyncError,
  resolveUser,
  syncLearnerMoodleActivities,
} from "./moodle-sync-core.ts";
import { repairMoodleEvidenceRecords } from "./moodle-evidence-records.ts";
import {
  ACTIVE_MOODLE_SYNC_ACTIONS,
  bodyAttemptsIdentityOverride,
  buildSafeMoodleTestResponse,
  disabledDebugActionPayload,
  isDisabledMoodleDebugAction,
  MOODLE_SYNC_FUNCTION_VERSION,
  normalizeMoodleSyncAction,
} from "./moodle-sync-security.ts";
import { bodyAttemptsMoodleHostOverride } from "./moodle-site-url.ts";

const FUNCTION_VERSION = MOODLE_SYNC_FUNCTION_VERSION;
const SUPPORTED_ACTIONS = ACTIVE_MOODLE_SYNC_ACTIONS;

function invalidActionResponse(req: Request, raw: unknown, normalized: string) {
  return json(
    {
      error: "Invalid action",
      code: "INVALID_ACTION",
      received: raw ?? null,
      normalized: normalized || null,
      supportedActions: SUPPORTED_ACTIONS,
      functionVersion: FUNCTION_VERSION,
      hint: "Moodle sync function does not support this action. Redeploy: supabase functions deploy moodle-sync",
    },
    400,
    req,
  );
}

async function parseBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (body && typeof body === "object" && !Array.isArray(body)) {
      return body as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * Authenticate before any Moodle or DB work.
 * Identity always comes from the JWT — body userId/email fields are ignored.
 */
async function requireAuth(req: Request) {
  return resolveUser(req);
}

async function runLearnerSync(
  req: Request,
  body: Record<string, unknown>,
  forceResync: boolean,
) {
  const resolved = await requireAuth(req);
  if ("error" in resolved && resolved.error) return resolved.error;

  // Authenticated identity only — never trust body.userId / body.email / Moodle host.
  const { userId, authEmail, admin } = resolved;
  logSyncStage("sync_auth_ok", {
    userId,
    authEmail,
    forceResync,
    identityOverrideAttempt: bodyAttemptsIdentityOverride(body),
    moodleHostOverrideAttempt: bodyAttemptsMoodleHostOverride(body),
  });

  let institutionEmail: string | null = null;
  const { data: profile, error: profileErr } = await admin
    .from("learner_profiles")
    .select("university_email")
    .eq("user_id", userId)
    .maybeSingle();
  if (profileErr) {
    logSyncStage("learner_profile_lookup_failed", { userId, error: profileErr.message });
  }
  institutionEmail = profile?.university_email ?? null;

  const result = await syncLearnerMoodleActivities(
    admin,
    userId,
    authEmail,
    institutionEmail,
    { forceResync },
  );

  return json({
    success: true,
    courses: result.courses,
    assignments: result.assignments,
    grades: result.grades,
    feedback: result.feedback,
    completion: result.completion,
    url: result.url ?? getExpectedMoodleSiteUrl(),
    moodleUserId: result.moodleUserId,
    moodleSiteUrl: result.moodleSiteUrl,
    warnings: result.warnings,
    cleanup: result.cleanup ?? null,
    evidenceRepair: result.evidenceRepair ?? null,
    debug: result.debug ?? null,
    functionVersion: FUNCTION_VERSION,
    supportedActions: SUPPORTED_ACTIONS,
  }, 200, req);
}

async function handleMoodleSyncRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed", code: "METHOD_NOT_ALLOWED" }, 405, req);
  }

  try {
    const body = await parseBody(req);
    const rawAction = body.action;
    const action = normalizeMoodleSyncAction(rawAction);

    logSyncStage("request_received", {
      action,
      rawAction: rawAction ?? null,
      functionVersion: FUNCTION_VERSION,
      supportedActions: SUPPORTED_ACTIONS,
    });

    // Disabled debug proxies: no auth Moodle fan-out; never call Moodle.
    if (isDisabledMoodleDebugAction(action)) {
      logSyncStage("disabled_debug_action", { action });
      return json(disabledDebugActionPayload(action), 410, req);
    }

    if (action === "test") {
      const resolved = await requireAuth(req);
      if ("error" in resolved && resolved.error) return resolved.error;

      const siteInfo = await callMoodle("core_webservice_get_site_info") as Record<string, unknown>;
      return json(
        buildSafeMoodleTestResponse({
          siteInfo,
          functionVersion: FUNCTION_VERSION,
        }),
        200,
        req,
      );
    }

    if (action === "sync_moodle_data") {
      return await runLearnerSync(req, body, true);
    }

    if (action === "sync_activities") {
      const forceResync = body.force === true || body.forceResync === true;
      return await runLearnerSync(req, body, forceResync);
    }

    if (action === "repair_moodle_evidence_records") {
      const resolved = await requireAuth(req);
      if ("error" in resolved && resolved.error) {
        return resolved.error;
      }

      const result = await repairMoodleEvidenceRecords(
        resolved.admin,
        resolved.userId,
      );

      return json({
        success: true,
        action: "repair_moodle_evidence_records",
        result,
        functionVersion: FUNCTION_VERSION,
        supportedActions: SUPPORTED_ACTIONS,
      }, 200, req);
    }

    if (!action) {
      return json(
        {
          error: "Missing action in request body",
          code: "MISSING_ACTION",
          supportedActions: SUPPORTED_ACTIONS,
          functionVersion: FUNCTION_VERSION,
          hint: 'Send JSON body: { "action": "sync_moodle_data" }',
        },
        400,
        req,
      );
    }

    return invalidActionResponse(req, rawAction, action);
  } catch (error) {
    console.error("moodle-sync error:", error);

    if (error instanceof MoodleSyncError) {
      logSyncStage("sync_error", { code: error.code, message: error.message, details: error.details });
      return json(
        {
          error: error.message,
          code: error.code,
          details: error.details ?? null,
          functionVersion: FUNCTION_VERSION,
          supportedActions: SUPPORTED_ACTIONS,
        },
        error.code === "UNAUTHORIZED" ? 401 : 400,
        req,
      );
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    logSyncStage("sync_error_unhandled", { message });
    return json(
      {
        error: message,
        code: "MOODLE_API_UNAVAILABLE",
        functionVersion: FUNCTION_VERSION,
        supportedActions: SUPPORTED_ACTIONS,
      },
      500,
      req,
    );
  }
}

/**
 * Hosted Edge: Deno.serve(handler) with platform-managed bind.
 * Local bridge: MOODLE_SYNC_BRIDGE_PORT avoids clashing with Moodle :8000.
 */
const bridgePortRaw = Deno.env.get("MOODLE_SYNC_BRIDGE_PORT")?.trim();
if (bridgePortRaw) {
  const port = Number(bridgePortRaw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid MOODLE_SYNC_BRIDGE_PORT: ${bridgePortRaw}`);
  }
  logSyncStage("bridge_listen", { port, functionVersion: FUNCTION_VERSION });
  Deno.serve({ port, hostname: "127.0.0.1" }, handleMoodleSyncRequest);
} else {
  Deno.serve(handleMoodleSyncRequest);
}
