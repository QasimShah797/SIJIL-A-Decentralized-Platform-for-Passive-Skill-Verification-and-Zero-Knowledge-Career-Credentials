import {
  callMoodle,
  corsHeaders,
  EXPECTED_MOODLE_SITE_URL,
  json,
  logMoodleEnvConfig,
  logSyncStage,
  MoodleSyncError,
  resolveUser,
  syncLearnerMoodleActivities,
} from "./moodle-sync-core.ts";
import { repairMoodleEvidenceRecords } from "./moodle-evidence-records.ts";

/** Bump when deploying — exposed in test/sync responses so frontend can detect stale deploys. */
const FUNCTION_VERSION = "3.4.0";

const SUPPORTED_ACTIONS = [
  "test",
  "sync_activities",
  "sync_moodle_data",
  "repair_moodle_evidence_records",
  "get_courses",
  "find_user_by_email",
  "get_user_courses",
  "get_completion",
  "get_grades",
] as const;

function normalizeAction(raw: unknown): string {
  const s = String(raw ?? "").trim().toLowerCase().replace(/-/g, "_");
  if (s === "sync_moodle_data" || s === "refresh_moodle_data") {
    return "sync_moodle_data";
  }
  if (
    s === "repair_moodle_evidence"
    || s === "repair_moodle_evidence_records"
    || s === "repair_moodle_evidence_mapping"
  ) {
    return "repair_moodle_evidence_records";
  }
  if (
    s === "sync"
    || s === "sync_moodle"
    || s === "sync_moodle_activities"
    || s === "syncactivities"
    || s === "sync_activities"
  ) {
    return "sync_activities";
  }
  return s;
}

function invalidActionResponse(raw: unknown, normalized: string) {
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

async function runLearnerSync(
  req: Request,
  body: Record<string, unknown>,
  forceResync: boolean,
) {
  const resolved = await resolveUser(req);
  if ("error" in resolved && resolved.error) return resolved.error;

  const { userId, authEmail, admin } = resolved;
  logSyncStage("sync_auth_ok", { userId, authEmail, forceResync });

  let institutionEmail: string | null =
    typeof body.institutionEmail === "string" ? body.institutionEmail : null;

  if (!institutionEmail) {
    const { data: profile, error: profileErr } = await admin
      .from("learner_profiles")
      .select("university_email")
      .eq("user_id", userId)
      .maybeSingle();
    if (profileErr) {
      logSyncStage("learner_profile_lookup_failed", { userId, error: profileErr.message });
    }
    institutionEmail = profile?.university_email ?? null;
  }

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
    url: result.url ?? EXPECTED_MOODLE_SITE_URL,
    moodleUserId: result.moodleUserId,
    moodleSiteUrl: result.moodleSiteUrl,
    warnings: result.warnings,
    cleanup: result.cleanup ?? null,
    evidenceRepair: result.evidenceRepair ?? null,
    debug: result.debug ?? null,
    functionVersion: FUNCTION_VERSION,
    supportedActions: SUPPORTED_ACTIONS,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed", code: "METHOD_NOT_ALLOWED" }, 405);
  }

  try {
    const body = await parseBody(req);
    const rawAction = body.action;
    const action = normalizeAction(rawAction);

    logSyncStage("request_received", {
      action,
      rawAction: rawAction ?? null,
      functionVersion: FUNCTION_VERSION,
      supportedActions: SUPPORTED_ACTIONS,
    });

    if (action === "test") {
      const envConfig = logMoodleEnvConfig();
      const siteInfo = await callMoodle("core_webservice_get_site_info");
      return json({
        success: true,
        siteInfo,
        moodleEnv: envConfig,
        functionVersion: FUNCTION_VERSION,
        supportedActions: SUPPORTED_ACTIONS,
      });
    }

    if (action === "sync_moodle_data") {
      return await runLearnerSync(req, body, true);
    }

    if (action === "get_courses") {
      const courses = await callMoodle("core_course_get_courses");
      return json({ success: true, courses, functionVersion: FUNCTION_VERSION });
    }

    if (action === "find_user_by_email") {
      const email = body.email;
      if (!email) return json({ error: "email is required" }, 400);
      const user = await callMoodle("core_user_get_users", {
        criteria: [{ key: "email", value: email }],
      });
      return json({ success: true, user });
    }

    if (action === "get_user_courses") {
      const moodleUserId = body.moodleUserId;
      if (!moodleUserId) return json({ error: "moodleUserId is required" }, 400);
      const courses = await callMoodle("core_enrol_get_users_courses", { userid: moodleUserId });
      return json({ success: true, courses });
    }

    if (action === "get_completion") {
      const moodleUserId = body.moodleUserId;
      const courseId = body.courseId;
      if (!moodleUserId || !courseId) {
        return json({ error: "moodleUserId and courseId are required" }, 400);
      }
      const completion = await callMoodle("core_completion_get_course_completion_status", {
        userid: moodleUserId,
        courseid: courseId,
      });
      return json({ success: true, completion });
    }

    if (action === "get_grades") {
      const moodleUserId = body.moodleUserId;
      const courseId = body.courseId;
      if (!moodleUserId || !courseId) {
        return json({ error: "moodleUserId and courseId are required" }, 400);
      }
      const grades = await callMoodle("gradereport_user_get_grade_items", {
        userid: moodleUserId,
        courseid: courseId,
      });
      return json({ success: true, grades });
    }

    if (action === "sync_activities") {
      const forceResync = body.force === true || body.forceResync === true;
      return await runLearnerSync(req, body, forceResync);
    }

    if (action === "repair_moodle_evidence_records") {
      const resolved = await resolveUser(req);
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
      });
    }

    if (!action) {
      return json(
        {
          error: "Missing action in request body",
          code: "MISSING_ACTION",
          supportedActions: SUPPORTED_ACTIONS,
          functionVersion: FUNCTION_VERSION,
          hint: 'Send JSON body: { "action": "repair_moodle_evidence_records" }',
        },
        400,
      );
    }

    return invalidActionResponse(rawAction, action);
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
    );
  }
});
