/**
 * Moodle LMS sync core — fetches courses, assignments, submissions, grades, feedback
 * and upserts into Supabase moodle_* + lms_evidence tables.
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import {
  repairMoodleEvidenceRecords,
  resolveCompetencyForMoodleAssignment,
  upsertMoodleAssignmentEvidenceRecord,
} from "./moodle-evidence-records.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MOODLE_BASE_URL = Deno.env.get("MOODLE_BASE_URL");
const MOODLE_TOKEN = Deno.env.get("MOODLE_TOKEN");

/** Canonical MoodleCloud site — only this instance is supported. */
export const EXPECTED_MOODLE_SITE_URL = "https://sijil-fyp.moodlecloud.com";

let moodleEnvLogged = false;

/** Safe startup diagnostics — never logs the token value. */
export function logMoodleEnvConfig(): {
  baseUrl: string | null;
  tokenExists: boolean;
  tokenLength: number;
  restEndpoint: string | null;
} {
  const baseUrl = MOODLE_BASE_URL?.trim().replace(/\/+$/, "") ?? null;
  const tokenExists = Boolean(MOODLE_TOKEN?.trim());
  const tokenLength = MOODLE_TOKEN?.trim().length ?? 0;
  const restEndpoint = baseUrl ? `${baseUrl}/webservice/rest/server.php` : null;

  if (!moodleEnvLogged) {
    moodleEnvLogged = true;
    logSyncStage("moodle_env_config", {
      baseUrl,
      tokenExists,
      tokenLength,
      restEndpoint,
    });
  }

  return { baseUrl, tokenExists, tokenLength, restEndpoint };
}

function getMoodleBaseUrl(): string {
  const { baseUrl } = logMoodleEnvConfig();
  if (!baseUrl) {
    throw new MoodleSyncError(
      "INVALID_MOODLE_TOKEN",
      "Moodle is not configured (missing MOODLE_BASE_URL).",
    );
  }
  return baseUrl;
}

export function getMoodleRestEndpoint(): string {
  const baseUrl = getMoodleBaseUrl();
  return `${baseUrl.replace(/\/+$/, "")}/webservice/rest/server.php`;
}

async function parseMoodleJsonResponse(
  res: Response,
  context: string,
  bodyText: string,
): Promise<Record<string, unknown>> {
  const contentType = res.headers.get("content-type") ?? "";

  logSyncStage("moodle_http_response", {
    context,
    baseUrl: getMoodleBaseUrl(),
    httpStatus: res.status,
    contentType,
  });

  if (!bodyText.trim()) {
    throw new MoodleSyncError("MOODLE_API_UNAVAILABLE", `${context}: empty response from Moodle.`, {
      httpStatus: res.status,
      contentType,
    });
  }

  const looksHtml = bodyText.trimStart().startsWith("<") ||
    contentType.includes("text/html");
  if (looksHtml) {
    logSyncStage("moodle_html_response", {
      context,
      httpStatus: res.status,
      contentType,
      preview: bodyText.slice(0, 100),
    });
    throw new MoodleSyncError(
      "MOODLE_API_UNAVAILABLE",
      "Moodle server returned HTML instead of JSON. Check MOODLE_BASE_URL in Supabase secrets.",
      { context, httpStatus: res.status, contentType },
    );
  }

  try {
    return JSON.parse(bodyText) as Record<string, unknown>;
  } catch {
    logSyncStage("moodle_json_parse_failed", {
      context,
      httpStatus: res.status,
      contentType,
      preview: bodyText.slice(0, 100),
    });
    throw new MoodleSyncError(
      "MOODLE_API_UNAVAILABLE",
      `${context}: invalid JSON from Moodle.`,
      { httpStatus: res.status, contentType },
    );
  }
}

export type MoodleSyncErrorCode =
  | "INVALID_MOODLE_TOKEN"
  | "MOODLE_API_UNAVAILABLE"
  | "MOODLE_ACCESS_DENIED"
  | "MOODLE_USER_NOT_FOUND"
  | "MOODLE_EMAIL_MISMATCH"
  | "NO_ENROLLED_COURSES"
  | "NO_ASSIGNMENTS"
  | "DATABASE_TABLE_MISSING"
  | "DATABASE_INSERT_FAILED"
  | "UNAUTHORIZED";

export const MOODLE_GRADE_PERMISSION_WARNING =
  "Moodle token lacks permission to read assignment grades. Enable assignment and grade web service permissions in Moodle (mod_assign_get_assignments, mod_assign_get_grades, mod_assign_get_submissions, gradereport_user_get_grade_items).";

export class MoodleSyncError extends Error {
  code: MoodleSyncErrorCode;
  details?: Record<string, unknown>;
  constructor(code: MoodleSyncErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export function logSyncStage(stage: string, data: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ service: "moodle-sync", stage, ts: new Date().toISOString(), ...data }));
}

function isMissingTableError(message: string, code?: string): boolean {
  const m = message.toLowerCase();
  return (
    code === "42P01" ||
    m.includes("does not exist") ||
    m.includes("could not find the table") ||
    m.includes("schema cache")
  );
}

async function dbUpsert(
  admin: SupabaseClient,
  table: string,
  row: Record<string, unknown>,
  onConflict: string,
  required = true,
): Promise<void> {
  let payload = row;
  let { error } = await admin.from(table).upsert(payload, { onConflict });

  if (
    error &&
    table === "moodle_assignments" &&
    "feedback" in payload &&
    /feedback/.test(error.message)
  ) {
    const { feedback: _omit, ...withoutFeedback } = payload;
    payload = withoutFeedback;
    ({ error } = await admin.from(table).upsert(payload, { onConflict }));
  }

  if (!error) {
    logSyncStage("db_upsert_ok", { table, onConflict, user_id: row.user_id });
    return;
  }

  logSyncStage("db_upsert_failed", {
    table,
    onConflict,
    user_id: row.user_id,
    error: error.message,
    code: error.code,
    details: error.details,
  });

  if (!required) return;

  throw new MoodleSyncError(
    isMissingTableError(error.message, error.code ?? undefined)
      ? "DATABASE_TABLE_MISSING"
      : "DATABASE_INSERT_FAILED",
    `Failed to save Moodle data to ${table}: ${error.message}`,
    { table, code: error.code, hint: "Run supabase/migrations/20260706120000_moodle_sync_tables.sql in Supabase SQL Editor" },
  );
}

function isAccessControlError(message: string, errorcode?: string): boolean {
  const m = message.toLowerCase();
  const code = (errorcode ?? "").toLowerCase();
  return (
    code.includes("accessexception") ||
    code === "accessdenied" ||
    m.includes("access control exception") ||
    m.includes("access denied") ||
    m.includes("not allowed")
  );
}

async function tryCallMoodle(
  wsfunction: string,
  paramsObj: Record<string, unknown> = {},
): Promise<
  | { ok: true; data: unknown }
  | { ok: false; accessDenied: boolean; wsfunction: string; message: string }
> {
  try {
    return { ok: true, data: await callMoodle(wsfunction, paramsObj) };
  } catch (err) {
    if (err instanceof MoodleSyncError && err.code === "MOODLE_ACCESS_DENIED") {
      return {
        ok: false,
        accessDenied: true,
        wsfunction,
        message: err.message,
      };
    }
    throw err;
  }
}

function normalizeActivityName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

type GradeReportItem = {
  grade: number | null;
  gradeMax: number | null;
  gradeFormatted: string | null;
  feedback: string | null;
  itemName: string;
  raw: Record<string, unknown>;
};

async function fetchCourseGradeReport(
  moodleUserId: number,
  courseId: number,
  courseName: string,
): Promise<{
  byAssignmentId: Map<number, GradeReportItem>;
  byName: Map<string, GradeReportItem>;
  accessDenied: boolean;
  failedWsfunction?: string;
}> {
  const byAssignmentId = new Map<number, GradeReportItem>();
  const byName = new Map<string, GradeReportItem>();

  const ingestGradeItems = (items: Record<string, unknown>[], source: string) => {
    for (const item of items) {
      const instanceId = Number(item.iteminstance ?? item.itemid ?? 0);
      const itemName = String(item.itemname ?? item.itemnameformatted ?? "");
      const module = String(item.itemmodule ?? item.itemtype ?? "").toLowerCase();

      const gradeFormattedRaw = item.gradeformatted
        ? String(item.gradeformatted)
        : item.gradeformattedraw
          ? String(item.gradeformattedraw)
          : null;
      let grade = parseMoodleGrade(item.grade ?? item.graderaw ?? item.finalgrade);
      if (grade === null && gradeFormattedRaw) {
        const match = gradeFormattedRaw.match(/^([\d.]+)/);
        if (match) grade = parseMoodleGrade(match[1]);
      }
      const gradeMax = parseNum(item.grademax ?? item.grademaxformatted);
      const feedbackRaw = item.feedback ?? item.feedbackcontent ?? item.feedbacktext ?? null;
      const feedback = feedbackRaw ? stripHtml(String(feedbackRaw)) : null;
      const parsed: GradeReportItem = {
        grade,
        gradeMax,
        gradeFormatted: gradeFormattedRaw ?? gradeDisplay(grade, gradeMax),
        feedback,
        itemName,
        raw: { ...item, _source: source },
      };

      if (module === "assign" && instanceId > 0) {
        byAssignmentId.set(instanceId, parsed);
      }
      if (itemName) {
        byName.set(normalizeActivityName(itemName), parsed);
      }
    }
  };

  const result = await tryCallMoodle("gradereport_user_get_grade_items", {
    userid: moodleUserId,
    courseid: courseId,
  });

  if (!result.ok && byAssignmentId.size === 0) {
    logSyncStage("gradereport_user_get_grade_items_failed", {
      courseId,
      courseName,
      moodleUserId,
      wsfunction: result.wsfunction,
      accessDenied: result.accessDenied,
      error: result.message,
    });
    return { byAssignmentId, byName, accessDenied: result.accessDenied, failedWsfunction: result.wsfunction };
  }

  if (result.ok) {
    const items =
      (result.data as { usergrades?: { gradeitems?: Record<string, unknown>[] }[] })?.usergrades?.[0]
        ?.gradeitems ?? [];
    ingestGradeItems(items, "gradereport_user_get_grade_items");
  }

  logSyncStage("gradereport_user_get_grade_items_result", {
    courseId,
    courseName,
    moodleUserId,
    assignGradeItemCount: byAssignmentId.size,
    items: [...byAssignmentId.entries()].map(([id, g]) => ({
      assignmentId: id,
      name: g.itemName,
      grade: g.grade,
      gradeMax: g.gradeMax,
      hasFeedback: Boolean(g.feedback),
    })),
  });

  return { byAssignmentId, byName, accessDenied: false };
}

export function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function addParam(params: URLSearchParams, key: string, value: unknown) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      if (item !== null && typeof item === "object" && !Array.isArray(item)) {
        Object.entries(item as Record<string, unknown>).forEach(([childKey, childValue]) => {
          params.append(`${key}[${index}][${childKey}]`, String(childValue));
        });
      } else {
        // Moodle REST: courseids[0]=2, assignmentids[0]=5
        params.append(`${key}[${index}]`, String(item));
      }
    });
  } else if (value !== null && typeof value === "object") {
    Object.entries(value as Record<string, unknown>).forEach(([childKey, childValue]) => {
      addParam(params, `${key}[${childKey}]`, childValue);
    });
  } else {
    params.append(key, String(value));
  }
}

export async function callMoodle(
  wsfunction: string,
  paramsObj: Record<string, unknown> = {},
) {
  logMoodleEnvConfig();
  if (!MOODLE_BASE_URL?.trim() || !MOODLE_TOKEN?.trim()) {
    throw new MoodleSyncError(
      "INVALID_MOODLE_TOKEN",
      "Moodle is not configured (missing MOODLE_BASE_URL or MOODLE_TOKEN).",
    );
  }

  const params = new URLSearchParams();
  params.append("wstoken", MOODLE_TOKEN);
  params.append("wsfunction", wsfunction);
  params.append("moodlewsrestformat", "json");

  for (const [key, value] of Object.entries(paramsObj)) {
    addParam(params, key, value);
  }

  logSyncStage("moodle_api_request", {
    wsfunction,
    paramKeys: [...params.keys()].filter((k) => k !== "wstoken"),
  });

  let res: Response;
  try {
    res = await fetch(getMoodleRestEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });
  } catch {
    throw new MoodleSyncError("MOODLE_API_UNAVAILABLE", "Could not reach the Moodle server.");
  }

  const bodyText = await res.text();
  const data = await parseMoodleJsonResponse(res, wsfunction, bodyText);

  logSyncStage("moodle_api_response", {
    wsfunction,
    httpStatus: res.status,
    hasException: Boolean(data?.exception || data?.errorcode),
    errorcode: data?.errorcode ?? null,
  });

  if (!res.ok || data?.exception || data?.errorcode) {
    const msg = data?.message || data?.debuginfo || "Moodle API request failed";
    const errorcode = String(data?.errorcode ?? "");

    logSyncStage("moodle_api_error", {
      wsfunction,
      baseUrl: getMoodleBaseUrl(),
      httpStatus: res.status,
      contentType: res.headers.get("content-type") ?? "",
      preview: bodyText.slice(0, 100),
      errorcode: errorcode || null,
      exception: data?.exception ?? null,
      message: msg,
    });

    if (errorcode === "invalidtoken" || String(msg).toLowerCase().includes("invalid token")) {
      throw new MoodleSyncError("INVALID_MOODLE_TOKEN", `${wsfunction}: ${msg}`, { wsfunction, errorcode });
    }
    if (isAccessControlError(msg, errorcode)) {
      throw new MoodleSyncError("MOODLE_ACCESS_DENIED", `${wsfunction}: ${msg}`, { wsfunction, errorcode });
    }
    throw new MoodleSyncError("MOODLE_API_UNAVAILABLE", `${wsfunction}: ${msg}`, { wsfunction, errorcode });
  }

  return data;
}

export async function resolveUser(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: json({ error: "Unauthorized" }, 401) };
  }

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userData.user) {
    return { error: json({ error: "Unauthorized" }, 401) };
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  return {
    userId: userData.user.id,
    authEmail: userData.user.email ?? null,
    admin,
  };
}

function isLmsConnectionsColumnError(message: string, code?: string): boolean {
  const m = message.toLowerCase();
  return (
    code === "PGRST204" ||
    m.includes("does not exist") ||
    m.includes("schema cache") ||
    m.includes("could not find")
  );
}

/** Normalize Moodle site URL for consistent storage and filtering. */
export function normalizeMoodleSiteUrl(url: string): string {
  return url.trim().replace(/\/+$/, "").toLowerCase();
}

/** Build lms_connections payload using only columns defined in repo migrations. */
function buildLmsConnectionRow(input: {
  userId: string;
  moodleUserId: number;
  moodleEmail: string | null;
  institutionEmail: string | null;
  moodleSiteUrl: string;
  syncedAt: string;
  lastVerified: string;
}): Record<string, unknown> {
  return {
    user_id: input.userId,
    provider: "moodle",
    moodle_user_id: input.moodleUserId,
    moodle_email: input.moodleEmail,
    institution_email: input.institutionEmail,
    moodle_site_url: input.moodleSiteUrl,
    last_synced_at: input.syncedAt,
    last_verified: input.lastVerified,
    updated_at: input.syncedAt,
  };
}

function normalizeEmailAddress(email: string): string {
  return email.trim().toLowerCase();
}

export type ResolvedMoodleIdentity = {
  moodleUserId: number;
  moodleEmail: string;
  moodleFirstName: string | null;
  moodleLastName: string | null;
  moodleUsername: string | null;
};

/**
 * Resolve Moodle learner by SIJIL auth email — never use token owner userid or stored moodle_user_id.
 */
export async function resolveMoodleUserBySijilEmail(
  sijilEmail: string,
): Promise<ResolvedMoodleIdentity> {
  const normalizedSijilEmail = normalizeEmailAddress(sijilEmail);
  if (!normalizedSijilEmail) {
    throw new MoodleSyncError(
      "MOODLE_USER_NOT_FOUND",
      "SIJIL authenticated user has no email address.",
    );
  }

  const result = await callMoodle("core_user_get_users", {
    criteria: [{ key: "email", value: normalizedSijilEmail }],
  });

  const users = (result?.users ?? []) as Array<{
    id?: number;
    email?: string;
    firstname?: string;
    lastname?: string;
    username?: string;
  }>;

  if (!users.length) {
    throw new MoodleSyncError(
      "MOODLE_USER_NOT_FOUND",
      `No Moodle account found for email ${sijilEmail}.`,
      { sijilEmail: normalizedSijilEmail },
    );
  }

  const moodleUser = users[0];
  const moodleUserId = Number(moodleUser.id);
  const moodleEmail = String(moodleUser.email ?? "").trim();

  if (!moodleUserId || moodleUserId <= 0) {
    throw new MoodleSyncError(
      "MOODLE_USER_NOT_FOUND",
      "Moodle returned an invalid userid for the matched email.",
      { sijilEmail: normalizedSijilEmail, moodleEmail },
    );
  }

  if (!moodleEmail || normalizeEmailAddress(moodleEmail) !== normalizedSijilEmail) {
    throw new MoodleSyncError(
      "MOODLE_EMAIL_MISMATCH",
      "Moodle account email does not match SIJIL account email",
      { sijilEmail: normalizedSijilEmail, moodleEmail: moodleEmail || null },
    );
  }

  return {
    moodleUserId,
    moodleEmail,
    moodleFirstName: moodleUser.firstname ?? null,
    moodleLastName: moodleUser.lastname ?? null,
    moodleUsername: moodleUser.username ?? null,
  };
}

function logMoodleIdentitySync(input: {
  sijilEmail: string;
  moodleEmail: string;
  moodleUserId: number;
  coursesReturned: number;
}) {
  const payload = {
    "SIJIL email": input.sijilEmail,
    "Moodle email": input.moodleEmail,
    "Moodle userid": input.moodleUserId,
    "Courses returned": input.coursesReturned,
  };
  logSyncStage("Moodle Identity Sync", payload);
  console.log("Moodle Identity Sync:", JSON.stringify(payload, null, 2));
}

/** Delete moodle_courses, moodle_assignments, moodle_feedback for one learner before fresh insert. */
async function purgeLearnerMoodleCourseRecords(
  admin: SupabaseClient,
  userId: string,
): Promise<Pick<MoodleCleanupStats, "moodle_feedback" | "moodle_assignments" | "moodle_courses">> {
  const deleteCount = (result: { count: number | null; error: { message: string } | null }) => {
    if (result.error) {
      logSyncStage("purge_learner_course_records_failed", { error: result.error.message });
      return 0;
    }
    return result.count ?? 0;
  };

  const feedback = await admin
    .from("moodle_feedback")
    .delete({ count: "exact" })
    .eq("user_id", userId);
  const assignments = await admin
    .from("moodle_assignments")
    .delete({ count: "exact" })
    .eq("user_id", userId);
  const courses = await admin
    .from("moodle_courses")
    .delete({ count: "exact" })
    .eq("user_id", userId);

  const stats = {
    moodle_feedback: deleteCount(feedback),
    moodle_assignments: deleteCount(assignments),
    moodle_courses: deleteCount(courses),
  };

  logSyncStage("purge_learner_course_records_complete", { userId, ...stats });
  return stats;
}

export type MoodleCleanupStats = {
  moodle_feedback: number;
  moodle_assignments: number;
  moodle_courses: number;
  moodle_grades: number;
  lms_evidence: number;
  imported_lms_evidence: number;
  evidence_records: number;
};

function emptyCleanupStats(): MoodleCleanupStats {
  return {
    moodle_feedback: 0,
    moodle_assignments: 0,
    moodle_courses: 0,
    moodle_grades: 0,
    lms_evidence: 0,
    imported_lms_evidence: 0,
    evidence_records: 0,
  };
}

function isMoodleLmsSource(source: unknown): boolean {
  const s = String(source ?? "").trim().toLowerCase();
  return s.includes("moodle") || s === "lms";
}

/** Resolve the learner Moodle user ID from SIJIL auth email via core_user_get_users. */
async function resolveActiveMoodleLearnerUserId(
  sijilEmail: string,
): Promise<ResolvedMoodleIdentity> {
  return resolveMoodleUserBySijilEmail(sijilEmail);
}

function assertExpectedMoodleSite(siteurl: string): string {
  const normalized = normalizeMoodleSiteUrl(siteurl || getMoodleBaseUrl());
  const expected = normalizeMoodleSiteUrl(EXPECTED_MOODLE_SITE_URL);
  if (normalized !== expected) {
    logSyncStage("moodle_site_url_mismatch", { siteurl, normalized, expected });
    throw new MoodleSyncError(
      "MOODLE_API_UNAVAILABLE",
      `Moodle token is connected to ${siteurl}, expected ${EXPECTED_MOODLE_SITE_URL}. Update MOODLE_BASE_URL and MOODLE_TOKEN Supabase secrets.`,
      { siteurl: normalized, expected },
    );
  }
  return normalized;
}

/** Wipe all Moodle rows for one learner — used after successful fetch before fresh insert. */
async function purgeAllMoodleDataForLearner(
  admin: SupabaseClient,
  userId: string,
  currentSiteUrl: string,
  forceAll: boolean,
): Promise<MoodleCleanupStats> {
  const { data, error } = await admin.rpc("purge_stale_moodle_data_for_user", {
    p_user_id: userId,
    p_current_site: currentSiteUrl,
    p_force_all: forceAll,
  });

  if (!error && data && typeof data === "object") {
    const stats = data as MoodleCleanupStats;
    logSyncStage("purge_rpc_complete", { userId, forceAll, stats });
    return stats;
  }

  logSyncStage("purge_rpc_fallback", { userId, error: error?.message ?? null });
  return cleanupStaleMoodleDataForLearner(admin, userId, currentSiteUrl, {
    removeOtherSites: true,
  });
}

async function readStoredMoodleConnection(
  admin: SupabaseClient,
  userId: string,
): Promise<{ moodle_user_id: number | null; moodle_site_url: string | null }> {
  const { data } = await admin
    .from("lms_connections")
    .select("moodle_user_id,moodle_site_url")
    .eq("user_id", userId)
    .maybeSingle();
  return {
    moodle_user_id: data?.moodle_user_id != null ? Number(data.moodle_user_id) : null,
    moodle_site_url: typeof data?.moodle_site_url === "string" ? data.moodle_site_url : null,
  };
}

/**
 * Safely remove Moodle records for one learner. Always filters by user_id.
 * Deletes child rows before parents to avoid FK errors.
 */
export async function cleanupStaleMoodleDataForLearner(
  admin: SupabaseClient,
  userId: string,
  currentSiteUrl: string,
  options: {
    /** Remove rows from other Moodle sites (and legacy NULL site rows). */
    removeOtherSites?: boolean;
    /** Remove current-site rows whose Moodle IDs were not returned by the latest sync. */
    staleCourseIds?: number[];
    staleAssignmentIds?: number[];
    staleGradeKeys?: Array<{ courseId: number; itemId: number }>;
    /** Remove Moodle lms_evidence hashes not in the latest sync set. */
    staleEvidenceHashes?: string[];
  } = {},
): Promise<MoodleCleanupStats> {
  const stats = emptyCleanupStats();
  const normalizedCurrent = normalizeMoodleSiteUrl(currentSiteUrl);

  const deleteCount = (result: { count: number | null; error: { message: string } | null }) => {
    if (result.error) {
      logSyncStage("cleanup_delete_failed", { error: result.error.message });
      return 0;
    }
    return result.count ?? 0;
  };

  const isOtherSiteFilter = (column = "moodle_site_url") =>
    `${column}.is.null,${column}.neq.${normalizedCurrent}`;

  if (options.removeOtherSites) {
    const fb = await admin
      .from("moodle_feedback")
      .delete({ count: "exact" })
      .eq("user_id", userId)
      .or(isOtherSiteFilter());
    stats.moodle_feedback += deleteCount(fb);

    const imported = await admin
      .from("imported_lms_evidence")
      .delete({ count: "exact" })
      .eq("user_id", userId)
      .or(isOtherSiteFilter());
    stats.imported_lms_evidence += deleteCount(imported);

    const assigns = await admin
      .from("moodle_assignments")
      .delete({ count: "exact" })
      .eq("user_id", userId)
      .or(isOtherSiteFilter());
    stats.moodle_assignments += deleteCount(assigns);

    const grades = await admin
      .from("moodle_grades")
      .delete({ count: "exact" })
      .eq("user_id", userId)
      .or(isOtherSiteFilter());
    stats.moodle_grades += deleteCount(grades);

    const courses = await admin
      .from("moodle_courses")
      .delete({ count: "exact" })
      .eq("user_id", userId)
      .or(isOtherSiteFilter());
    stats.moodle_courses += deleteCount(courses);

    const { data: staleLmsRows } = await admin
      .from("lms_evidence")
      .select("id,source,moodle_site_url")
      .eq("user_id", userId);

    const staleLmsIds = (staleLmsRows ?? [])
      .filter((row) => isMoodleLmsSource(row.source))
      .filter((row) => {
        const site = row.moodle_site_url;
        if (!site) return true;
        return normalizeMoodleSiteUrl(String(site)) !== normalizedCurrent;
      })
      .map((row) => row.id as string);

    if (staleLmsIds.length) {
      await admin
        .from("imported_lms_evidence")
        .update({ lms_evidence_id: null })
        .eq("user_id", userId)
        .in("lms_evidence_id", staleLmsIds);

      const lmsEv = await admin
        .from("lms_evidence")
        .delete({ count: "exact" })
        .eq("user_id", userId)
        .in("id", staleLmsIds);
      stats.lms_evidence += deleteCount(lmsEv);
    }

    const { data: staleEvidenceRecords } = await admin
      .from("evidence_records")
      .select("id,source,metadata")
      .eq("user_id", userId)
      .or("source.ilike.%moodle%,source.ilike.%lms%");

    const staleRecordIds = (staleEvidenceRecords ?? [])
      .filter((row) => {
        const meta = row.metadata as Record<string, unknown> | null;
        const metaSite = typeof meta?.moodle_site_url === "string"
          ? normalizeMoodleSiteUrl(meta.moodle_site_url)
          : null;
        return !metaSite || metaSite !== normalizedCurrent;
      })
      .map((row) => row.id as string);

    if (staleRecordIds.length) {
      await admin
        .from("skill_evidence_links")
        .delete()
        .eq("user_id", userId)
        .in("evidence_record_id", staleRecordIds);

      const evRec = await admin
        .from("evidence_records")
        .delete({ count: "exact" })
        .eq("user_id", userId)
        .in("id", staleRecordIds);
      stats.evidence_records += deleteCount(evRec);
    }
  }

  if (options.staleAssignmentIds?.length) {
    const staleAssignIds = options.staleAssignmentIds;
    const fb = await admin
      .from("moodle_feedback")
      .delete({ count: "exact" })
      .eq("user_id", userId)
      .eq("moodle_site_url", normalizedCurrent)
      .in("moodle_assignment_id", staleAssignIds);
    stats.moodle_feedback += deleteCount(fb);

    const imported = await admin
      .from("imported_lms_evidence")
      .delete({ count: "exact" })
      .eq("user_id", userId)
      .eq("moodle_site_url", normalizedCurrent)
      .in("moodle_assignment_id", staleAssignIds);
    stats.imported_lms_evidence += deleteCount(imported);

    const assigns = await admin
      .from("moodle_assignments")
      .delete({ count: "exact" })
      .eq("user_id", userId)
      .eq("moodle_site_url", normalizedCurrent)
      .in("moodle_assignment_id", staleAssignIds);
    stats.moodle_assignments += deleteCount(assigns);
  }

  if (options.staleCourseIds?.length) {
    const staleCourseIds = options.staleCourseIds;
    const { data: staleAssignRows } = await admin
      .from("moodle_assignments")
      .select("moodle_assignment_id")
      .eq("user_id", userId)
      .eq("moodle_site_url", normalizedCurrent)
      .in("moodle_course_id", staleCourseIds);

    const assignIdsFromCourses = (staleAssignRows ?? []).map((r) => Number(r.moodle_assignment_id));
    if (assignIdsFromCourses.length) {
      const extra = await cleanupStaleMoodleDataForLearner(admin, userId, currentSiteUrl, {
        staleAssignmentIds: assignIdsFromCourses,
      });
      for (const key of Object.keys(stats) as (keyof MoodleCleanupStats)[]) {
        stats[key] += extra[key];
      }
    }

    const grades = await admin
      .from("moodle_grades")
      .delete({ count: "exact" })
      .eq("user_id", userId)
      .eq("moodle_site_url", normalizedCurrent)
      .in("moodle_course_id", staleCourseIds);
    stats.moodle_grades += deleteCount(grades);

    const courses = await admin
      .from("moodle_courses")
      .delete({ count: "exact" })
      .eq("user_id", userId)
      .eq("moodle_site_url", normalizedCurrent)
      .in("moodle_course_id", staleCourseIds);
    stats.moodle_courses += deleteCount(courses);
  }

  if (options.staleGradeKeys?.length) {
    for (const { courseId, itemId } of options.staleGradeKeys) {
      const grades = await admin
        .from("moodle_grades")
        .delete({ count: "exact" })
        .eq("user_id", userId)
        .eq("moodle_site_url", normalizedCurrent)
        .eq("moodle_course_id", courseId)
        .eq("item_id", itemId);
      stats.moodle_grades += deleteCount(grades);
    }
  }

  if (options.staleEvidenceHashes?.length) {
    const lmsEv = await admin
      .from("lms_evidence")
      .delete({ count: "exact" })
      .eq("user_id", userId)
      .eq("moodle_site_url", normalizedCurrent)
      .in("evidence_hash", options.staleEvidenceHashes);
    stats.lms_evidence += deleteCount(lmsEv);
  }

  logSyncStage("cleanup_complete", { userId, currentSiteUrl: normalizedCurrent, stats });
  return stats;
}

async function findStaleMoodleIds(
  admin: SupabaseClient,
  userId: string,
  currentSiteUrl: string,
  syncedCourseIds: Set<number>,
  syncedAssignmentIds: Set<number>,
  syncedGradeKeys: Set<string>,
  syncedEvidenceHashes: Set<string>,
): Promise<{
  staleCourseIds: number[];
  staleAssignmentIds: number[];
  staleGradeKeys: Array<{ courseId: number; itemId: number }>;
  staleEvidenceHashes: string[];
}> {
  const normalizedCurrent = normalizeMoodleSiteUrl(currentSiteUrl);

  const { data: courseRows } = await admin
    .from("moodle_courses")
    .select("moodle_course_id")
    .eq("user_id", userId)
    .eq("moodle_site_url", normalizedCurrent);

  const staleCourseIds = (courseRows ?? [])
    .map((r) => Number(r.moodle_course_id))
    .filter((id) => id > 0 && !syncedCourseIds.has(id));

  const { data: assignRows } = await admin
    .from("moodle_assignments")
    .select("moodle_assignment_id")
    .eq("user_id", userId)
    .eq("moodle_site_url", normalizedCurrent);

  const staleAssignmentIds = (assignRows ?? [])
    .map((r) => Number(r.moodle_assignment_id))
    .filter((id) => id > 0 && !syncedAssignmentIds.has(id));

  const { data: gradeRows } = await admin
    .from("moodle_grades")
    .select("moodle_course_id,item_id")
    .eq("user_id", userId)
    .eq("moodle_site_url", normalizedCurrent);

  const staleGradeKeys = (gradeRows ?? [])
    .map((r) => ({
      courseId: Number(r.moodle_course_id),
      itemId: Number(r.item_id),
      key: `${r.moodle_course_id}:${r.item_id}`,
    }))
    .filter((r) => r.courseId > 0 && r.itemId > 0 && !syncedGradeKeys.has(r.key))
    .map(({ courseId, itemId }) => ({ courseId, itemId }));

  const { data: lmsRows } = await admin
    .from("lms_evidence")
    .select("evidence_hash,source")
    .eq("user_id", userId)
    .eq("moodle_site_url", normalizedCurrent);

  const staleEvidenceHashes = (lmsRows ?? [])
    .filter((r) => isMoodleLmsSource(r.source))
    .map((r) => String(r.evidence_hash))
    .filter((hash) => hash && !syncedEvidenceHashes.has(hash));

  return { staleCourseIds, staleAssignmentIds, staleGradeKeys, staleEvidenceHashes };
}

/** Upsert lms_connections; strip unknown columns when PostgREST schema cache rejects them. */
async function upsertLmsConnection(
  admin: SupabaseClient,
  row: Record<string, unknown>,
) {
  logSyncStage("lms_connection_upsert_start", {
    user_id: row.user_id,
    columns: Object.keys(row),
  });

  let attempt: Record<string, unknown> = { ...row };
  delete attempt.moodle_username;
  delete attempt.metadata;

  for (let tries = 0; tries < 8; tries++) {
    const { error } = await admin.from("lms_connections").upsert(attempt, { onConflict: "user_id" });
    if (!error) {
      logSyncStage("lms_connection_upsert_ok", {
        user_id: row.user_id,
        columns: Object.keys(attempt),
      });
      return;
    }

    const message = error.message ?? "";
    logSyncStage("lms_connection_upsert_retry", {
      user_id: row.user_id,
      error: message,
      code: error.code,
      columns: Object.keys(attempt),
    });

    if (!isLmsConnectionsColumnError(message, error.code ?? undefined)) {
      throw new MoodleSyncError("DATABASE_INSERT_FAILED", `Failed to update lms_connections: ${message}`, {
        table: "lms_connections",
        code: error.code,
      });
    }

    const columnMatch = message.match(/'([^']+)'\s+column/i);
    const missingColumn = columnMatch?.[1];
    if (missingColumn && missingColumn in attempt) {
      delete attempt[missingColumn];
      continue;
    }

    attempt = {
      user_id: row.user_id,
      last_synced_at: row.last_synced_at,
      updated_at: row.updated_at,
    };
  }

  throw new MoodleSyncError(
    "DATABASE_INSERT_FAILED",
    "Failed to update lms_connections after removing unsupported columns.",
    { table: "lms_connections" },
  );
}

type MoodleUser = { id: number; email?: string; fullname?: string; username?: string };

/** Verify Moodle REST connectivity via site-wide web service token. */
export async function verifyMoodleSiteConnection(): Promise<{
  siteurl: string;
  username: string;
  userid: number;
}> {
  const siteInfo = await callMoodle("core_webservice_get_site_info");
  const siteurl = String(siteInfo.siteurl ?? "");
  const username = String(siteInfo.username ?? "");
  const userid = Number(siteInfo.userid);
  logSyncStage("moodle_site_verified", { siteurl, username, userid });
  return { siteurl, username, userid };
}

export async function findMoodleUserByEmails(emails: string[]): Promise<MoodleUser | null> {
  const tried = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  for (const email of tried) {
    const result = await callMoodle("core_user_get_users", {
      criteria: [{ key: "email", value: email }],
    });
    const users = result?.users ?? [];
    if (users.length > 0) {
      return users[0] as MoodleUser;
    }
  }
  return null;
}

function parseNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Moodle uses -1 when no grade is released yet. */
function parseMoodleGrade(v: unknown): number | null {
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (!trimmed || trimmed === "—" || trimmed === "-") return null;
    const fraction = trimmed.match(/^([\d.]+)\s*(?:\/\s*([\d.]+))?$/);
    if (fraction) return parseMoodleGrade(fraction[1]);
  }
  const n = parseNum(v);
  if (n === null || n < 0) return null;
  return n;
}

function parseGradeFromFormatted(value: string | null | undefined): number | null {
  if (!value?.trim() || value === "—" || value === "-") return null;
  const match = value.trim().match(/^([\d.]+)/);
  return match ? parseMoodleGrade(match[1]) : null;
}

function tsToIso(ts: unknown): string | null {
  const n = parseNum(ts);
  if (!n || n <= 0) return null;
  return new Date(n * 1000).toISOString();
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

/** Strip HTML tags, decode entities, and trim — used for Moodle rich-text fields. */
function cleanMoodleText(raw: string): string {
  return decodeHtmlEntities(stripHtml(raw)).trim();
}

function isTeacherFeedbackCommentsPlugin(plugin: Record<string, unknown>): boolean {
  const type = String(plugin?.type ?? "").toLowerCase();
  const name = String(plugin?.name ?? "").toLowerCase();
  return (
    type === "comments" ||
    name.includes("feedback comments") ||
    name.includes("comments")
  );
}

function summarizePluginStructure(plugin: Record<string, unknown>) {
  return {
    type: plugin.type ?? null,
    name: plugin.name ?? null,
    keys: Object.keys(plugin),
    editorfields: plugin.editorfields ?? null,
    fileareas: plugin.fileareas ?? null,
  };
}

function extractTextFromCommentsPlugin(plugin: Record<string, unknown>): string[] {
  const parts: string[] = [];
  for (const row of (plugin.editorfields as unknown[]) ?? []) {
    const r = row as Record<string, unknown>;
    for (const key of ["text", "value", "content"]) {
      const v = r[key];
      if (typeof v === "string" && v.trim()) {
        parts.push(cleanMoodleText(v));
      }
    }
  }
  return parts.filter(Boolean);
}

function extractFeedbackFromFeedbackPlugins(plugins: unknown[]): string | null {
  const parts = (plugins as Record<string, unknown>[])
    .flatMap((plugin) => (plugin.editorfields as Record<string, unknown>[]) ?? [])
    .map((field) => {
      const text = field?.text;
      return typeof text === "string" && text.trim() ? cleanMoodleText(text) : null;
    })
    .filter((t): t is string => Boolean(t));
  return parts.length ? [...new Set(parts)].join("\n").trim() : null;
}

type LastAttemptExtract = {
  lastAttempt: Record<string, unknown> | null;
  submission: Record<string, unknown> | undefined;
  grade: number | null;
  gradeMax: number | null;
  feedbackText: string | null;
  submissionFound: boolean;
  feedbackFound: boolean;
  gradedAt: string | null;
  submittedAt: string | null;
};

/** Primary grade/feedback source: mod_assign_get_submission_status → lastattempt */
function extractFromSubmissionStatusResponse(
  response: Record<string, unknown> | null,
): LastAttemptExtract {
  const lastAttempt = (response?.lastattempt as Record<string, unknown> | undefined) ?? null;
  const submission = lastAttempt ?? undefined;
  const submissionFound = Boolean(lastAttempt);

  const gradeBlock = lastAttempt?.grade as Record<string, unknown> | undefined;
  const grade = parseMoodleGrade(
    gradeBlock?.value
    ?? gradeBlock?.grade
    ?? gradeBlock?.graderaw
    ?? gradeBlock?.rawgrade
    ?? gradeBlock?.strgrade
    ?? gradeBlock?.formatted,
  );
  const gradeMax = parseNum(
    gradeBlock?.max
    ?? gradeBlock?.grademax
    ?? gradeBlock?.grademaxformatted,
  );

  const feedbackPlugins = (lastAttempt?.feedbackplugins as unknown[]) ?? [];
  const feedbackText = extractFeedbackFromFeedbackPlugins(feedbackPlugins);
  const feedbackFound = Boolean(feedbackText?.trim());

  const gradedAt = tsToIso(
    gradeBlock?.dategraded ?? gradeBlock?.timemodified ?? lastAttempt?.timemodified,
  );
  const submittedAt = tsToIso(
    lastAttempt?.timemodified ?? lastAttempt?.timecreated,
  );

  return {
    lastAttempt,
    submission,
    grade,
    gradeMax,
    feedbackText,
    submissionFound,
    feedbackFound,
    gradedAt,
    submittedAt,
  };
}

function logAssignmentSyncDebug(
  assignmentId: number,
  extract: Pick<LastAttemptExtract, "submissionFound" | "grade" | "feedbackFound">,
) {
  const payload = {
    assignment_id: assignmentId,
    submission_found: extract.submissionFound,
    grade: extract.grade !== null ? String(extract.grade) : null,
    feedback_found: extract.feedbackFound,
  };
  logSyncStage("Assignment Sync", payload);
  console.log(JSON.stringify(payload));
}

function extractFeedbackTextFromPluginsLegacy(plugins: unknown[]): string | null {
  const parts: string[] = [];
  for (const plugin of plugins) {
    const p = plugin as Record<string, unknown>;
    parts.push(...extractTextFromCommentsPlugin(p));
    for (const key of ["text", "content", "value", "feedback"]) {
      const v = p[key];
      if (typeof v === "string" && v.trim()) parts.push(cleanMoodleText(v));
    }
  }
  const unique = [...new Set(parts.filter(Boolean))];
  return unique.length ? unique.join("\n").trim() : null;
}

function extractCommentsFeedbackFromPlugins(
  plugins: unknown[],
  context: { assignmentId: number; moodleUserId: number; source: string },
): { text: string | null; detectedPlugin: Record<string, unknown> | null } {
  logSyncStage("feedback_plugins_inspect", {
    ...context,
    pluginCount: plugins.length,
    pluginSummaries: plugins.map((p) => summarizePluginStructure(p as Record<string, unknown>)),
  });

  const broadText = extractFeedbackFromFeedbackPlugins(plugins) ??
    extractFeedbackTextFromPluginsLegacy(plugins);
  if (broadText) {
    const detectedPlugin = (plugins[0] as Record<string, unknown>) ?? null;
    logSyncStage("feedback_comments_extracted", {
      ...context,
      detectedFeedbackPlugin: detectedPlugin ? { type: detectedPlugin.type, name: detectedPlugin.name } : null,
      extractedFeedbackText: broadText,
    });
    return { text: broadText, detectedPlugin };
  }

  let detectedPlugin: Record<string, unknown> | null = null;
  const parts: string[] = [];

  for (const plugin of plugins) {
    const p = plugin as Record<string, unknown>;
    if (!isTeacherFeedbackCommentsPlugin(p)) continue;
    detectedPlugin = p;
    parts.push(...extractTextFromCommentsPlugin(p));
  }

  const text = parts.length ? [...new Set(parts.filter(Boolean))].join("\n").trim() : null;

  logSyncStage("feedback_comments_extracted", {
    ...context,
    detectedFeedbackPlugin: detectedPlugin
      ? { type: detectedPlugin.type, name: detectedPlugin.name }
      : null,
    extractedFeedbackText: text,
  });

  return { text, detectedPlugin };
}

/**
 * Resolve teacher feedback from Moodle assign grade / feedback plugin data.
 * mod_assign_get_grades returns grade numbers but usually NOT feedback plugins;
 * mod_assign_get_submission_status.feedback.plugins carries Feedback comments.
 */
async function resolveTeacherFeedback(
  assignmentId: number,
  moodleUserId: number,
  gradeRow: Record<string, unknown> | undefined,
  courseId?: number,
  preloadedSubmissionStatus?: Record<string, unknown> | null,
): Promise<{
  text: string | null;
  graderId: number | null;
  detectedPlugin: Record<string, unknown> | null;
  source: string | null;
  rawDebug: unknown;
}> {
  const graderFromGradeRow = gradeRow?.grader ? Number(gradeRow.grader) : null;

  logSyncStage("mod_assign_get_grades_grade_object_debug", {
    wsfunction: "mod_assign_get_grades",
    courseId: courseId ?? null,
    assignmentId,
    moodleUserId,
    gradeObjectPresent: Boolean(gradeRow),
    grade_plugins: gradeRow?.plugins ?? null,
    grade_feedback: gradeRow?.feedback ?? null,
    grade_feedbacktext: gradeRow?.feedbacktext ?? null,
    gradeKeys: gradeRow ? Object.keys(gradeRow) : [],
    fullGradeObject: gradeRow ?? null,
  });

  const pluginSources: {
    source: string;
    plugins: unknown[];
    graderId?: number | null;
  }[] = [];

  if (Array.isArray(gradeRow?.plugins) && (gradeRow.plugins as unknown[]).length > 0) {
    pluginSources.push({
      source: "mod_assign_get_grades.grade.plugins",
      plugins: gradeRow.plugins as unknown[],
      graderId: graderFromGradeRow,
    });
  }

  let submissionStatusRaw: Record<string, unknown> | null = preloadedSubmissionStatus ?? null;

  if (!submissionStatusRaw) {
    const statusResult = await tryCallMoodle("mod_assign_get_submission_status", {
      assignid: assignmentId,
      userid: moodleUserId,
    });

    if (statusResult.ok) {
      submissionStatusRaw = statusResult.data as Record<string, unknown>;
    } else {
      logSyncStage("mod_assign_get_submission_status_failed", {
        wsfunction: statusResult.wsfunction,
        assignmentId,
        moodleUserId,
        accessDenied: statusResult.accessDenied,
        error: statusResult.message,
      });
    }
  }

  if (submissionStatusRaw) {
    const lastAttempt = submissionStatusRaw.lastattempt as Record<string, unknown> | undefined;
    const lastAttemptPlugins = (lastAttempt?.feedbackplugins as unknown[]) ?? [];
    if (lastAttemptPlugins.length > 0) {
      pluginSources.push({
        source: "mod_assign_get_submission_status.lastattempt.feedbackplugins",
        plugins: lastAttemptPlugins,
      });
    }

    const feedbackBlock = submissionStatusRaw.feedback as Record<string, unknown> | undefined;
    const feedbackPlugins = (feedbackBlock?.plugins as unknown[]) ?? [];

    logSyncStage("mod_assign_get_submission_status_feedback_block", {
      assignmentId,
      moodleUserId,
      hasFeedbackBlock: Boolean(feedbackBlock),
      feedbackPluginCount: feedbackPlugins.length,
      feedbackGrade: feedbackBlock?.grade ?? null,
    });

    if (feedbackPlugins.length > 0) {
      const feedbackGrade = feedbackBlock?.grade as Record<string, unknown> | undefined;
      pluginSources.push({
        source: "mod_assign_get_submission_status.feedback.plugins",
        plugins: feedbackPlugins,
        graderId: feedbackGrade?.grader ? Number(feedbackGrade.grader) : graderFromGradeRow,
      });
    }

    for (const att of (submissionStatusRaw.previousattempts as unknown[]) ?? []) {
      const attempt = att as Record<string, unknown>;
      const prevPlugins = (attempt.feedbackplugins as unknown[]) ?? [];
      if (prevPlugins.length > 0) {
        pluginSources.push({
          source: `mod_assign_get_submission_status.previousattempts[${attempt.attemptnumber}].feedbackplugins`,
          plugins: prevPlugins,
        });
      }
    }
  }

  for (const { source, plugins, graderId } of pluginSources) {
    const { text, detectedPlugin } = extractCommentsFeedbackFromPlugins(plugins, {
      assignmentId,
      moodleUserId,
      source,
    });
    if (text) {
      const resolvedGrader = graderId ?? graderFromGradeRow;
      return {
        text,
        graderId: Number.isFinite(resolvedGrader) && Number(resolvedGrader) > 0
          ? Number(resolvedGrader)
          : null,
        detectedPlugin,
        source,
        rawDebug: { gradeRow: gradeRow ?? null, submissionStatusFeedback: submissionStatusRaw?.feedback ?? null },
      };
    }
  }

  logSyncStage("teacher_feedback_not_found_full_structure", {
    assignmentId,
    moodleUserId,
    courseId: courseId ?? null,
    mod_assign_get_grades: {
      grade_plugins: gradeRow?.plugins ?? null,
      grade_feedback: gradeRow?.feedback ?? null,
      grade_feedbacktext: gradeRow?.feedbacktext ?? null,
      fullGradeObject: gradeRow ?? null,
    },
    mod_assign_get_submission_status: submissionStatusRaw
      ? {
          topLevelKeys: Object.keys(submissionStatusRaw),
          feedback: submissionStatusRaw.feedback ?? null,
        }
      : null,
    pluginSourcesAttempted: pluginSources.map((s) => ({
      source: s.source,
      pluginCount: s.plugins.length,
      pluginsFullStructure: s.plugins,
    })),
  });

  return {
    text: null,
    graderId: Number.isFinite(graderFromGradeRow) && Number(graderFromGradeRow) > 0
      ? Number(graderFromGradeRow)
      : null,
    detectedPlugin: null,
    source: null,
    rawDebug: { gradeRow: gradeRow ?? null, submissionStatusFeedback: submissionStatusRaw?.feedback ?? null },
  };
}

/** Student submission content — kept separate from teacher feedback. */
function extractStudentSubmission(submission: Record<string, unknown> | undefined): {
  submissionText: string | null;
  submissionFiles: string[] | null;
} {
  if (!submission) return { submissionText: null, submissionFiles: null };

  const textParts: string[] = [];
  const files: string[] = [];

  for (const plugin of (submission.plugins as unknown[]) ?? []) {
    const p = plugin as Record<string, unknown>;
    const type = String(p?.type ?? "").toLowerCase();
    const name = String(p?.name ?? "").toLowerCase();

    if (type === "onlinetext" || name.includes("online text")) {
      for (const row of (p?.editorfields as unknown[]) ?? []) {
        const text = (row as Record<string, unknown>)?.text;
        if (text) textParts.push(cleanMoodleText(String(text)));
      }
    }

    if (type === "file" || name.includes("file submission") || name.includes("file")) {
      for (const row of (p?.fileareas as unknown[]) ?? []) {
        for (const f of ((row as Record<string, unknown>)?.files as unknown[]) ?? []) {
          const fn = (f as Record<string, unknown>)?.filename;
          if (fn && fn !== ".") files.push(String(fn));
        }
      }
    }
  }

  logSyncStage("student_submission_extracted", {
    hasText: textParts.length > 0,
    fileCount: files.length,
    textPreview: textParts.join("\n").slice(0, 120) || null,
  });

  return {
    submissionText: textParts.length ? textParts.join("\n") : null,
    submissionFiles: files.length ? files : null,
  };
}

function submissionStatusLabel(
  status?: string,
  gradingStatus?: string,
  grade: number | null = null,
  gradeReleased = false,
): string {
  const s = (status ?? "").toLowerCase();
  const g = (gradingStatus ?? "").toLowerCase();
  if (g === "graded" || (grade !== null && gradeReleased)) return "Graded";
  if (s === "submitted" || g === "released") return "Submitted";
  if (s === "draft" || s === "new") return "Pending";
  if (s === "notstarted") return "Not started";
  return status || gradingStatus || "Pending";
}

function gradeDisplay(grade: number | null, max: number | null): string {
  if (grade === null) return "—";
  if (max !== null) return `${grade} / ${max}`;
  return String(grade);
}

function evidenceHash(userId: string, courseId: number, assignmentId: number): string {
  return `moodle:${userId}:${courseId}:${assignmentId}`;
}

function normalizedCompetencyText(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function matchesCompetency(value: unknown, competencyName: string): boolean {
  const left = normalizedCompetencyText(value);
  const right = normalizedCompetencyText(competencyName);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function matchesCompetencyTags(tags: unknown, competencyName: string): boolean {
  if (!Array.isArray(tags)) return false;
  return tags.some((tag) => {
    if (typeof tag === "string") return matchesCompetency(tag, competencyName);
    if (tag && typeof tag === "object") {
      const row = tag as Record<string, unknown>;
      return matchesCompetency(row.name, competencyName)
        || matchesCompetency(row.shortname, competencyName)
        || matchesCompetency(row.label, competencyName);
    }
    return false;
  });
}

function resolveLinkedSkillId(
  declaredSkills: Array<{ id: string; name: string }>,
  params: {
    courseName: string;
    courseShortname?: string | null;
    assignmentName?: string | null;
    competencyTags?: unknown;
  },
): string | null {
  for (const skill of declaredSkills) {
    if (
      matchesCompetency(params.courseName, skill.name)
      || matchesCompetency(params.courseShortname, skill.name)
      || matchesCompetency(params.assignmentName, skill.name)
      || matchesCompetencyTags(params.competencyTags, skill.name)
    ) {
      return skill.id;
    }
  }
  return null;
}

async function linkUnmappedLmsEvidenceToSkills(
  admin: SupabaseClient,
  userId: string,
  declaredSkills: Array<{ id: string; name: string }>,
): Promise<number> {
  if (declaredSkills.length === 0) return 0;

  const { data: rows, error } = await admin
    .from("lms_evidence")
    .select("id, course_name, course_code, text_preview, linked_skill_id")
    .eq("user_id", userId)
    .is("linked_skill_id", null);

  if (error || !rows?.length) return 0;

  let linked = 0;
  for (const row of rows) {
    const skillId = resolveLinkedSkillId(declaredSkills, {
      courseName: String(row.course_name ?? ""),
      courseShortname: String(row.course_code ?? ""),
      assignmentName: String(row.text_preview ?? ""),
    });
    if (!skillId) continue;

    const { error: updateError } = await admin
      .from("lms_evidence")
      .update({ linked_skill_id: skillId })
      .eq("id", row.id)
      .eq("user_id", userId);

    if (!updateError) linked += 1;
  }

  return linked;
}

type CourseModule = { id: number; modname: string; name: string; instance: number | null };

type NormalizedAssignment = {
  id: number;
  cmid: number | null;
  name: string;
  gradeMax: number | null;
  source: "mod_assign_get_assignments" | "core_course_get_contents";
  raw: Record<string, unknown>;
};

function parseCourseContents(contents: unknown): {
  moduleMap: Map<number, { modname: string; name: string }>;
  assignModules: NormalizedAssignment[];
} {
  const moduleMap = new Map<number, { modname: string; name: string }>();
  const assignModules: NormalizedAssignment[] = [];

  for (const section of (contents ?? []) as Array<{ modules?: CourseModule[] }>) {
    for (const mod of section?.modules ?? []) {
      if (!mod?.id) continue;
      const cmid = Number(mod.id);
      moduleMap.set(cmid, {
        modname: mod.modname ?? "module",
        name: mod.name ?? "",
      });

      if (mod.modname === "assign") {
        const instanceId = Number(mod.instance ?? (mod as Record<string, unknown>).instanceid);
        if (instanceId > 0) {
          assignModules.push({
            id: instanceId,
            cmid,
            name: String(mod.name ?? `Assignment ${instanceId}`),
            gradeMax: null,
            source: "core_course_get_contents",
            raw: mod as unknown as Record<string, unknown>,
          });
        }
      }
    }
  }

  return { moduleMap, assignModules };
}

async function fetchCourseContents(courseId: number): Promise<{
  moduleMap: Map<number, { modname: string; name: string }>;
  assignModules: NormalizedAssignment[];
}> {
  const empty = { moduleMap: new Map<number, { modname: string; name: string }>(), assignModules: [] };
  try {
    const contents = await callMoodle("core_course_get_contents", { courseid: courseId });
    return parseCourseContents(contents);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logSyncStage("core_course_get_contents_failed", { courseId, error: msg });
    return empty;
  }
}

async function fetchModAssignAssignments(
  courseId: number,
  courseName: string,
): Promise<{ assignments: NormalizedAssignment[]; accessDenied: boolean; failedWsfunction?: string }> {
  const result = await tryCallMoodle("mod_assign_get_assignments", {
    courseids: [courseId],
  });

  if (!result.ok) {
    logSyncStage("mod_assign_get_assignments_failed", {
      courseId,
      courseName,
      wsfunction: result.wsfunction,
      accessDenied: result.accessDenied,
      error: result.message,
    });
    return {
      assignments: [],
      accessDenied: result.accessDenied,
      failedWsfunction: result.wsfunction,
    };
  }

  const assignPayload = result.data as { courses?: { id?: number; assignments?: Record<string, unknown>[] }[] };
  const courseBlocks = assignPayload?.courses ?? [];
  const courseBlock =
    courseBlocks.find((c) => Number(c.id) === courseId) ?? courseBlocks[0];

  const rawAssignments = courseBlock?.assignments ?? [];
  const parsed = rawAssignments
    .map((a: Record<string, unknown>) => ({
      id: Number(a.id),
      cmid: a.cmid ? Number(a.cmid) : null,
      name: String(a.name ?? `Assignment ${a.id}`),
      gradeMax: parseNum(a.grade),
      source: "mod_assign_get_assignments" as const,
      raw: a,
    }))
    .filter((a: NormalizedAssignment) => Number.isFinite(a.id) && a.id > 0);

  logSyncStage("mod_assign_get_assignments_result", {
    courseId,
    courseName,
    courseIdsRequested: [courseId],
    coursesReturned: courseBlocks.length,
    returnedCourseIds: courseBlocks.map((c: { id?: number }) => c.id),
    assignmentCount: parsed.length,
    assignmentIds: parsed.map((a: NormalizedAssignment) => a.id),
    assignmentNames: parsed.map((a: NormalizedAssignment) => a.name),
  });

  return { assignments: parsed, accessDenied: false };
}

async function fetchCourseAssignments(
  courseId: number,
  courseName: string,
): Promise<{
  assignments: NormalizedAssignment[];
  warnings: string[];
  moduleMap: Map<number, { modname: string; name: string }>;
  assignApiAccessDenied: boolean;
}> {
  const warnings: string[] = [];
  let assignApiAccessDenied = false;

  logSyncStage("fetch_assignments_start", { courseId, courseName });

  const modAssignResult = await fetchModAssignAssignments(courseId, courseName);
  const fromModAssign = modAssignResult.assignments;
  if (modAssignResult.accessDenied) {
    assignApiAccessDenied = true;
    warnings.push(
      `mod_assign_get_assignments access denied for "${courseName}" (course id ${courseId}). Using grade report fallback.`,
    );
  }

  const { moduleMap, assignModules } = await fetchCourseContents(courseId);
  const fromContents = assignModules;

  logSyncStage("core_course_get_contents_assign_modules", {
    courseId,
    courseName,
    assignmentCount: fromContents.length,
    modules: fromContents.map((a) => ({ assignmentId: a.id, cmid: a.cmid, name: a.name })),
  });

  const byId = new Map<number, NormalizedAssignment>();
  for (const a of fromContents) byId.set(a.id, a);
  for (const a of fromModAssign) {
    const existing = byId.get(a.id);
    byId.set(a.id, existing
      ? {
        ...existing,
        cmid: a.cmid ?? existing.cmid,
        name: a.name || existing.name,
        gradeMax: a.gradeMax ?? existing.gradeMax,
        source: "mod_assign_get_assignments",
        raw: { ...existing.raw, modAssign: a.raw },
      }
      : a);
  }

  const merged = [...byId.values()];

  logSyncStage("course_assignments_merged", {
    courseId,
    courseName,
    fromModAssign: fromModAssign.length,
    fromContents: fromContents.length,
    mergedCount: merged.length,
    sources: merged.map((a) => ({ id: a.id, name: a.name, source: a.source })),
  });

  if (merged.length === 0) {
    warnings.push(
      `Course "${courseName}" (id ${courseId}) exists but no Assignment activity exists in Moodle. Add an Assignment activity inside the course (Turn editing on → Add activity/resource → Assignment), not only a course topic or resource.`,
    );
  }

  return { assignments: merged, warnings, moduleMap, assignApiAccessDenied };
}

async function fetchCourseModuleMap(courseId: number): Promise<Map<number, { modname: string; name: string }>> {
  const { moduleMap } = await fetchCourseContents(courseId);
  return moduleMap;
}

async function fetchCompetencyTags(courseId: number): Promise<string[]> {
  try {
    const data = await callMoodle("core_competency_read_competencies_in_course", {
      courseid: courseId,
    });
    const comps = data?.competencies ?? data ?? [];
    if (!Array.isArray(comps)) return [];
    return comps
      .map((c: { competency?: { shortname?: string; id?: number }; shortname?: string }) =>
        c?.competency?.shortname ?? c?.shortname ?? (c?.competency?.id ? `competency-${c.competency.id}` : null)
      )
      .filter(Boolean) as string[];
  } catch {
    return [];
  }
}

function resolveAssignmentStatus(
  submission: Record<string, unknown> | undefined,
  gradeRow: Record<string, unknown> | undefined,
  reportItem: GradeReportItem | null | undefined,
  grade: number | null,
  gradeReleased: boolean,
  assignApiAccessDenied: boolean,
): string {
  if (grade !== null && gradeReleased) return "Graded";
  if (reportItem?.grade !== null && reportItem?.grade !== undefined) return "Graded";
  if (reportItem?.gradeFormatted && reportItem.gradeFormatted !== "—") return "Graded";
  if (assignApiAccessDenied && grade === null && !reportItem?.grade) return "Grade access denied";
  return submissionStatusLabel(
    String(submission?.status ?? ""),
    String(submission?.gradingstatus ?? gradeRow?.gradingstatus ?? ""),
    grade,
    gradeReleased,
  );
}

async function fetchAssignmentSubmissionAndGrade(
  assignmentId: number,
  moodleUserId: number,
  courseId: number,
  courseName: string,
): Promise<{
  submission: Record<string, unknown> | undefined;
  gradeRow: Record<string, unknown> | undefined;
  submissionStatus: Record<string, unknown> | null;
  lastAttempt: Record<string, unknown> | null;
  grade: number | null;
  gradeMax: number | null;
  feedbackText: string | null;
  submissionFound: boolean;
  feedbackFound: boolean;
  gradedAt: string | null;
  submittedAt: string | null;
  assignApiAccessDenied: boolean;
  failedFunctions: string[];
}> {
  let submission: Record<string, unknown> | undefined;
  let gradeRow: Record<string, unknown> | undefined;
  let submissionStatus: Record<string, unknown> | null = null;
  let lastAttempt: Record<string, unknown> | null = null;
  let grade: number | null = null;
  let gradeMax: number | null = null;
  let feedbackText: string | null = null;
  let submissionFound = false;
  let feedbackFound = false;
  let gradedAt: string | null = null;
  let submittedAt: string | null = null;
  const failedFunctions: string[] = [];
  let assignApiAccessDenied = false;

  const statusResult = await tryCallMoodle("mod_assign_get_submission_status", {
    assignid: assignmentId,
    userid: moodleUserId,
  });

  if (statusResult.ok) {
    submissionStatus = statusResult.data as Record<string, unknown>;
    const extracted = extractFromSubmissionStatusResponse(submissionStatus);
    lastAttempt = extracted.lastAttempt;
    submission = extracted.submission;
    grade = extracted.grade;
    gradeMax = extracted.gradeMax;
    feedbackText = extracted.feedbackText;
    submissionFound = extracted.submissionFound;
    feedbackFound = extracted.feedbackFound;
    gradedAt = extracted.gradedAt;
    submittedAt = extracted.submittedAt;

    if (lastAttempt) {
      gradeRow = {
        ...(lastAttempt.grade as Record<string, unknown> ?? {}),
        value: (lastAttempt.grade as Record<string, unknown> | undefined)?.value ?? grade,
        max: (lastAttempt.grade as Record<string, unknown> | undefined)?.max ?? gradeMax,
        feedbackplugins: lastAttempt.feedbackplugins,
        _source: "mod_assign_get_submission_status.lastattempt",
      };
    }

    logAssignmentSyncDebug(assignmentId, { submissionFound, grade, feedbackFound });
    logSyncStage("mod_assign_get_submission_status_result", {
      courseId,
      courseName,
      assignmentId,
      moodleUserId,
      submissionFound,
      grade,
      gradeMax,
      feedbackFound,
      lastAttemptKeys: lastAttempt ? Object.keys(lastAttempt) : [],
    });
  } else {
    failedFunctions.push(statusResult.wsfunction);
    if (statusResult.accessDenied) assignApiAccessDenied = true;
    logSyncStage("mod_assign_get_submission_status_failed", {
      wsfunction: statusResult.wsfunction,
      courseId,
      assignmentId,
      moodleUserId,
      accessDenied: statusResult.accessDenied,
      error: statusResult.message,
    });
    logAssignmentSyncDebug(assignmentId, { submissionFound: false, grade: null, feedbackFound: false });
  }

  if (!submission) {
    const subResult = await tryCallMoodle("mod_assign_get_submissions", {
      assignmentids: [assignmentId],
    });

    if (subResult.ok) {
      const subData = subResult.data as { assignments?: { assignmentid?: number; submissions?: Record<string, unknown>[] }[] };
      const block = (subData?.assignments ?? []).find(
        (b) => Number(b.assignmentid) === assignmentId,
      ) ?? subData?.assignments?.[0];

      submission = (block?.submissions ?? []).find(
        (s) => Number(s.userid) === moodleUserId,
      ) as Record<string, unknown> | undefined;

      logSyncStage("mod_assign_get_submissions_result", {
        courseId,
        courseName,
        assignmentId,
        moodleUserId,
        submissionCount: (block?.submissions ?? []).length,
        foundForUser: Boolean(submission),
        submissionStatus: submission?.status ?? null,
        gradingStatus: submission?.gradingstatus ?? null,
      });
    } else {
      failedFunctions.push(subResult.wsfunction);
      if (subResult.accessDenied) assignApiAccessDenied = true;
      logSyncStage("mod_assign_get_submissions_failed", {
        wsfunction: subResult.wsfunction,
        courseId,
        assignmentId,
        moodleUserId,
        accessDenied: subResult.accessDenied,
        error: subResult.message,
      });
    }
  }

  if (grade === null) {
    const gradeResult = await tryCallMoodle("mod_assign_get_grades", {
      assignmentids: [assignmentId],
    });

    if (gradeResult.ok) {
      const gradeData = gradeResult.data as { assignments?: { assignmentid?: number; grades?: Record<string, unknown>[] }[] };
      const block = (gradeData?.assignments ?? []).find(
        (b) => Number(b.assignmentid) === assignmentId,
      ) ?? gradeData?.assignments?.[0];

      const fallbackGradeRow = (block?.grades ?? []).find(
        (g) => Number(g.userid) === moodleUserId,
      ) as Record<string, unknown> | undefined;

      if (fallbackGradeRow) {
        gradeRow = { ...fallbackGradeRow, _source: "mod_assign_get_grades" };
        grade = parseMoodleGrade(
          fallbackGradeRow.grade
          ?? fallbackGradeRow.graderaw
          ?? fallbackGradeRow.rawgrade
          ?? fallbackGradeRow.strgrade,
        );
        if (gradeMax === null) {
          gradeMax = parseNum(fallbackGradeRow.grademax ?? fallbackGradeRow.grademaxformatted);
        }
        if (gradedAt === null) gradedAt = tsToIso(fallbackGradeRow.timemodified ?? fallbackGradeRow.timecreated);
      }

      logSyncStage("mod_assign_get_grades_result", {
        courseId,
        courseName,
        assignmentId,
        moodleUserId,
        gradeCount: (block?.grades ?? []).length,
        foundForUser: Boolean(fallbackGradeRow),
        grade: fallbackGradeRow?.grade ?? null,
        timemodified: fallbackGradeRow?.timemodified ?? null,
        grader: fallbackGradeRow?.grader ?? null,
        grade_plugins: fallbackGradeRow?.plugins ?? null,
        gradeKeys: fallbackGradeRow ? Object.keys(fallbackGradeRow) : [],
      });
    } else {
      failedFunctions.push(gradeResult.wsfunction);
      if (gradeResult.accessDenied) assignApiAccessDenied = true;
      logSyncStage("mod_assign_get_grades_failed", {
        wsfunction: gradeResult.wsfunction,
        courseId,
        assignmentId,
        moodleUserId,
        accessDenied: gradeResult.accessDenied,
        error: gradeResult.message,
      });
    }
  }

  if (submittedAt === null && submission) {
    submittedAt = tsToIso(submission.timemodified ?? submission.timecreated);
  }

  return {
    submission,
    gradeRow,
    submissionStatus,
    lastAttempt,
    grade,
    gradeMax,
    feedbackText,
    submissionFound,
    feedbackFound,
    gradedAt,
    submittedAt,
    assignApiAccessDenied,
    failedFunctions,
  };
}

function isOptionalCompletionError(errorcode: string, message: string): boolean {
  const code = errorcode.toLowerCase();
  const msg = message.toLowerCase();
  return (
    code === "nocriteriaset" ||
    code === "completionnotenabled" ||
    msg.includes("no completion criteria") ||
    msg.includes("completion criteria set") ||
    msg.includes("completion is not enabled")
  );
}

/** Optional — never fails sync when Moodle has no completion tracking for a course. */
async function fetchCourseCompletionStatus(
  moodleUserId: number,
  courseId: number,
): Promise<string | null> {
  try {
    const result = await tryCallMoodle("core_completion_get_course_completion_status", {
      userid: moodleUserId,
      courseid: courseId,
    });

    if (!result.ok) {
      logSyncStage("completion_unavailable", {
        course_id: courseId,
        moodleUserId,
        reason: result.message,
      });
      return null;
    }

    const payload = result.data as {
      completionstatus?: { completed?: boolean; aggregation?: number };
    };
    const status = payload?.completionstatus;
    if (!status) return null;
    if (status.completed) return "Completed";
    if (typeof status.aggregation === "number" && status.aggregation > 0) return "In progress";
    return "Not completed";
  } catch (err) {
    const details = err instanceof MoodleSyncError ? err.details : undefined;
    const errorcode = String(details?.errorcode ?? "");
    const message = err instanceof Error ? err.message : String(err);

    logSyncStage("completion_unavailable", {
      course_id: courseId,
      moodleUserId,
      errorcode: errorcode || null,
      message,
      optional: isOptionalCompletionError(errorcode, message),
    });

    return null;
  }
}

export type SyncActivitiesResult = {
  success: true;
  moodleUserId: number;
  moodleSiteUrl: string;
  courses: number;
  assignments: number;
  grades: number;
  feedback: number;
  completion: number;
  warnings: string[];
  cleanup?: MoodleCleanupStats;
  debug?: {
    moodleUrl: string;
    userid: number;
    sijilEmail?: string;
    moodleEmail?: string;
    coursesFetched: number;
    assignmentsFetched: number;
    gradesFetched: number;
    feedbackFetched: number;
    completionFetched: number;
  };
  /** Canonical Moodle site URL (sync_moodle_data response). */
  url?: string;
};

type PendingAssignmentSync = {
  courseId: number;
  courseName: string;
  courseShortname: string | null;
  courseCompletionStatus: string | null;
  competencyTags: string[];
  assign: NormalizedAssignment;
  submission: Record<string, unknown> | undefined;
  gradeRow: Record<string, unknown> | undefined;
  reportItem: GradeReportItem | null;
  submissionStatus: string;
  grade: number | null;
  gradeMax: number | null;
  gradeFormatted: string;
  gradeReleased: boolean;
  statusFeedback: Awaited<ReturnType<typeof resolveTeacherFeedback>>;
  submissionText: string | null;
  submissionFiles: string[] | null;
  gradedAt: string | null;
  submittedAt: string | null;
  failedFunctions: string[];
  lastAttempt: Record<string, unknown> | null;
  submissionStatusResponse: Record<string, unknown> | null;
};

type PendingGradeItem = {
  courseId: number;
  itemId: number;
  itemName: string;
  itemType: string | null;
  grade: number | null;
  gradeMax: number | null;
  gradeFormatted: string;
  raw: Record<string, unknown>;
};

export async function syncLearnerMoodleActivities(
  admin: SupabaseClient,
  userId: string,
  authEmail: string | null,
  institutionEmail: string | null,
  options: { forceResync?: boolean } = {},
): Promise<SyncActivitiesResult> {
  logSyncStage("sync_start", { userId, authEmail, institutionEmail, forceResync: options.forceResync ?? false });

  if (!authEmail?.trim()) {
    throw new MoodleSyncError(
      "UNAUTHORIZED",
      "SIJIL authenticated user has no email address.",
    );
  }

  const site = await verifyMoodleSiteConnection();
  const moodleSiteUrl = assertExpectedMoodleSite(site.siteurl || getMoodleBaseUrl());

  const {
    moodleUserId,
    moodleEmail,
    moodleFirstName,
    moodleLastName,
    moodleUsername,
  } = await resolveActiveMoodleLearnerUserId(authEmail);

  logSyncStage("moodle_user_found", {
    userId,
    moodleUserId,
    moodleEmail,
    moodleUsername,
    moodleFirstName,
    moodleLastName,
    moodleSiteUrl,
    sijilEmail: authEmail,
  });

  const now = new Date().toISOString();
  const warnings: string[] = [];

  await upsertLmsConnection(
    admin,
    buildLmsConnectionRow({
      userId,
      moodleUserId,
      moodleEmail,
      institutionEmail,
      moodleSiteUrl,
      syncedAt: now,
      lastVerified: now,
    }),
  );

  logSyncStage("fetch_enrolled_courses", { moodleUserId, moodleSiteUrl, sijilEmail: authEmail });
  const enrolled = await callMoodle("core_enrol_get_users_courses", { userid: moodleUserId });
  const courses = (Array.isArray(enrolled) ? enrolled : []).filter(
    (c: { id?: number }) => c?.id && Number(c.id) > 1,
  );

  logMoodleIdentitySync({
    sijilEmail: authEmail,
    moodleEmail,
    moodleUserId,
    coursesReturned: courses.length,
  });

  logSyncStage("enrolled_courses_result", {
    moodleUserId,
    sijilEmail: authEmail,
    moodleEmail,
    courseCount: courses.length,
    courseIds: courses.map((c: { id?: number }) => Number(c.id)),
    courseNames: courses.map((c: { fullname?: string; shortname?: string; id?: number }) =>
      c.fullname || c.shortname || `Course ${c.id}`,
    ),
  });

  const pendingAssignments: PendingAssignmentSync[] = [];
  const pendingGradeItems: PendingGradeItem[] = [];
  const courseCompletionById = new Map<number, string | null>();
  let completionCount = 0;
  let gradePermissionWarningAdded = false;

  for (const course of courses) {
    const courseId = Number(course.id);
    const courseName = course.fullname || course.shortname || `Course ${courseId}`;
    const courseCompletionStatus = await fetchCourseCompletionStatus(moodleUserId, courseId);
    courseCompletionById.set(courseId, courseCompletionStatus);
    if (courseCompletionStatus) completionCount += 1;
    const competencyTags = await fetchCompetencyTags(courseId);

    const {
      assignments: courseAssignments,
      warnings: courseWarnings,
      moduleMap,
      assignApiAccessDenied: courseAssignApiDenied,
    } = await fetchCourseAssignments(courseId, courseName);
    warnings.push(...courseWarnings);

    const gradeReport = await fetchCourseGradeReport(moodleUserId, courseId, courseName);
    if (courseAssignApiDenied || gradeReport.accessDenied) {
      if (!gradePermissionWarningAdded) {
        warnings.push(MOODLE_GRADE_PERMISSION_WARNING);
        gradePermissionWarningAdded = true;
      }
    }
    if (gradeReport.accessDenied && gradeReport.failedWsfunction) {
      warnings.push(
        `${gradeReport.failedWsfunction} access denied for "${courseName}" (course id ${courseId}).`,
      );
    }

    for (const assign of courseAssignments) {
      const assignmentId = assign.id;
      const name = assign.name;

      const reportItem =
        gradeReport.byAssignmentId.get(assignmentId) ??
        gradeReport.byName.get(normalizeActivityName(name)) ??
        null;

      let submission: Record<string, unknown> | undefined;
      let gradeRow: Record<string, unknown> | undefined;
      let submissionStatusPayload: Record<string, unknown> | null = null;
      let lastAttemptPayload: Record<string, unknown> | null = null;
      let itemAssignDenied = false;
      let failedFunctions: string[] = [];
      let grade: number | null = null;
      let gradeMax = assign.gradeMax ?? parseNum(assign.raw.grade) ?? null;
      let feedbackText: string | null = null;
      let gradedAt: string | null = null;
      let submittedAt: string | null = null;

      try {
        const fetched = await fetchAssignmentSubmissionAndGrade(
          assignmentId,
          moodleUserId,
          courseId,
          courseName,
        );
        submission = fetched.submission;
        gradeRow = fetched.gradeRow;
        submissionStatusPayload = fetched.submissionStatus;
        lastAttemptPayload = fetched.lastAttempt;
        itemAssignDenied = fetched.assignApiAccessDenied;
        failedFunctions = fetched.failedFunctions;
        grade = fetched.grade;
        if (fetched.gradeMax !== null) gradeMax = fetched.gradeMax;
        feedbackText = fetched.feedbackText;
        gradedAt = fetched.gradedAt;
        submittedAt = fetched.submittedAt;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push(`Submission status unavailable for "${name}": ${msg}`);
        logSyncStage("assignment_submission_fetch_skipped", { assignmentId, courseId, error: msg });
      }

      // gradereport_user_get_grade_items — fallback only when lastattempt has no grade
      if (grade === null && reportItem?.grade !== null && reportItem?.grade !== undefined) {
        grade = reportItem.grade;
      } else if (
        grade === null &&
        reportItem?.gradeFormatted &&
        reportItem.gradeFormatted !== "—"
      ) {
        const match = reportItem.gradeFormatted.match(/^([\d.]+)/);
        if (match) grade = parseMoodleGrade(match[1]);
      }
      if (gradeMax === null && reportItem?.gradeMax !== null) {
        gradeMax = reportItem.gradeMax;
      }
      if (grade === null && reportItem?.gradeFormatted) {
        grade = parseGradeFromFormatted(reportItem.gradeFormatted);
      }

      const gradeReleased =
        grade !== null ||
        String(submission?.gradingstatus ?? gradeRow?.gradingstatus ?? "").toLowerCase() === "graded";

      const assignApisDenied = courseAssignApiDenied || itemAssignDenied;
      const submissionStatus = resolveAssignmentStatus(
        submission,
        gradeRow,
        grade !== null ? null : reportItem,
        grade,
        gradeReleased,
        assignApisDenied && grade === null,
      );

      let statusFeedback: Awaited<ReturnType<typeof resolveTeacherFeedback>> = feedbackText?.trim()
        ? {
          text: feedbackText.trim(),
          graderId: gradeRow?.grader ? Number(gradeRow.grader) : null,
          detectedPlugin: null,
          source: "mod_assign_get_submission_status.lastattempt.feedbackplugins",
          rawDebug: {
            lastAttempt: lastAttemptPayload,
            submissionStatus: submissionStatusPayload,
          },
        }
        : await resolveTeacherFeedback(
          assignmentId,
          moodleUserId,
          gradeRow,
          courseId,
          submissionStatusPayload,
        );

      if (!statusFeedback.text?.trim() && reportItem?.feedback?.trim()) {
        statusFeedback = {
          ...statusFeedback,
          text: reportItem.feedback,
          source: "gradereport_user_get_grade_items.feedback",
        };
      }

      const { submissionText, submissionFiles } = extractStudentSubmission(submission);
      const gradeFormatted = grade !== null
        ? gradeDisplay(grade, gradeMax)
        : (reportItem?.gradeFormatted && reportItem.gradeFormatted !== "—"
          ? reportItem.gradeFormatted
          : gradeDisplay(null, gradeMax));

      if (grade === null && submissionStatus === "Submitted") {
        warnings.push(`Grade not released yet for "${name}" in ${courseName}`);
      }
      if (submissionStatus === "Grade access denied") {
        warnings.push(`Grade access denied for "${name}" in ${courseName} — Moodle token needs assignment/grade permissions.`);
      }

      pendingAssignments.push({
        courseId,
        courseName,
        courseShortname: course.shortname ?? null,
        courseCompletionStatus,
        competencyTags,
        assign,
        submission,
        gradeRow,
        reportItem,
        submissionStatus,
        grade,
        gradeMax,
        gradeFormatted,
        gradeReleased: grade !== null ? true : gradeReleased,
        statusFeedback,
        submissionText,
        submissionFiles,
        gradedAt: gradedAt ?? tsToIso(gradeRow?.timemodified ?? gradeRow?.timecreated),
        submittedAt: submittedAt ?? tsToIso(submission?.timemodified ?? submission?.timecreated),
        failedFunctions,
        lastAttempt: lastAttemptPayload,
        submissionStatusResponse: submissionStatusPayload,
      });
    }

    try {
      const reportResult = await tryCallMoodle("gradereport_user_get_grade_items", {
        userid: moodleUserId,
        courseid: courseId,
      });
      if (reportResult.ok) {
        const items =
          (reportResult.data as { usergrades?: { gradeitems?: Record<string, unknown>[] }[] })?.usergrades?.[0]
            ?.gradeitems ?? [];
        for (const item of items) {
          if (String(item.itemmodule ?? "") === "assign") continue;
          const itemId = Number(item.id ?? item.itemid);
          if (!itemId) continue;
          const itemGrade = parseMoodleGrade(item.grade ?? item.gradeformatted);
          const itemMax = parseNum(item.grademax);
          pendingGradeItems.push({
            courseId,
            itemId,
            itemName: String(item.itemname ?? "Grade item"),
            itemType: String(item.itemmodule ?? item.itemtype ?? "") || null,
            grade: itemGrade,
            gradeMax: itemMax,
            gradeFormatted: item.gradeformatted ? String(item.gradeformatted) : gradeDisplay(itemGrade, itemMax),
            raw: item,
          });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`Grade report unavailable for ${courseName}: ${msg}`);
    }
  }

  logSyncStage("fetch_complete_starting_db_sync", {
    userId,
    moodleSiteUrl,
    moodleUserId,
    courseCount: courses.length,
    pendingAssignments: pendingAssignments.length,
    pendingGradeItems: pendingGradeItems.length,
  });

  const courseRecordCleanup = await purgeLearnerMoodleCourseRecords(admin, userId);
  const cleanupStats: MoodleCleanupStats = {
    ...emptyCleanupStats(),
    ...courseRecordCleanup,
  };

  const syncedCourseIds = new Set<number>();
  const syncedAssignmentIds = new Set<number>();
  const syncedGradeKeys = new Set<string>();
  const syncedEvidenceHashes = new Set<string>();
  let feedbackCount = 0;
  let gradeItemCount = 0;

  for (const course of courses) {
    const courseId = Number(course.id);
    const courseName = course.fullname || course.shortname || `Course ${courseId}`;
    const courseCompletionStatus = courseCompletionById.get(courseId) ?? null;

    await dbUpsert(
      admin,
      "moodle_courses",
      {
        user_id: userId,
        moodle_course_id: courseId,
        moodle_site_url: moodleSiteUrl,
        fullname: courseName,
        shortname: course.shortname ?? null,
        summary: course.summary ? stripHtml(String(course.summary)).slice(0, 2000) : null,
        raw: {
          ...course,
          completion_status: courseCompletionStatus,
          moodle_site_url: moodleSiteUrl,
        },
        synced_at: now,
        updated_at: now,
      },
      "user_id,moodle_course_id",
    );
    syncedCourseIds.add(courseId);
  }

  const { data: declaredSkillsRows } = await admin
    .from("declared_skills")
    .select("id, name")
    .eq("user_id", userId);
  const declaredSkills = (declaredSkillsRows ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name ?? ""),
  }));

  console.log("[moodle-evidence] Moodle assignments found:", pendingAssignments.length);

  for (const pending of pendingAssignments) {
    const {
      courseId,
      courseName,
      courseShortname,
      courseCompletionStatus,
      competencyTags,
      assign,
      submission,
      gradeRow,
      reportItem,
      submissionStatus,
      grade,
      gradeMax,
      gradeFormatted,
      gradeReleased,
      statusFeedback,
      submissionText,
      submissionFiles,
      gradedAt,
      submittedAt,
      failedFunctions,
      lastAttempt,
      submissionStatusResponse,
    } = pending;

    const assignmentId = assign.id;
    const cmid = assign.cmid ?? (assign.raw.cmid ? Number(assign.raw.cmid) : null);
    const moduleType = "assign";
    const name = assign.name;

    if (grade !== null || (gradeFormatted && gradeFormatted !== "—")) gradeItemCount += 1;

    await dbUpsert(
      admin,
      "moodle_assignments",
      {
        user_id: userId,
        moodle_course_id: courseId,
        moodle_assignment_id: assignmentId,
        moodle_site_url: moodleSiteUrl,
        moodle_cmid: cmid,
        name,
        module_type: moduleType,
        submission_status: submissionStatus,
        grade,
        grade_max: gradeMax,
        grade_formatted: gradeFormatted,
        feedback: statusFeedback.text?.trim() || null,
        graded_at: gradedAt,
        submitted_at: submittedAt,
        grade_released: grade !== null ? true : gradeReleased,
        submission_text: submissionText,
        submission_files: submissionFiles,
        competency_tags: competencyTags.length ? competencyTags : null,
        raw: {
          source: assign.source,
          assign: assign.raw,
          submission,
          submissionStatus: submissionStatusResponse,
          lastAttempt,
          grade: gradeRow,
          gradeReport: reportItem?.raw ?? null,
          failedFunctions: failedFunctions.length ? failedFunctions : null,
          teacherFeedbackPlugin: statusFeedback.detectedPlugin,
          moodle_site_url: moodleSiteUrl,
        },
        synced_at: now,
        updated_at: now,
      },
      "user_id,moodle_assignment_id",
    );
    syncedAssignmentIds.add(assignmentId);

    if (statusFeedback.text?.trim()) {
      await dbUpsert(
        admin,
        "moodle_feedback",
        {
          user_id: userId,
          moodle_assignment_id: assignmentId,
          moodle_site_url: moodleSiteUrl,
          feedback_text: statusFeedback.text,
          grader_id: statusFeedback.graderId,
          raw: {
            source: statusFeedback.source ?? "mod_assign_get_grades",
            gradePlugins: (gradeRow?.plugins as unknown[]) ?? null,
            detectedFeedbackPlugin: statusFeedback.detectedPlugin,
            gradeRow: gradeRow ?? null,
            debug: statusFeedback.rawDebug,
            moodle_site_url: moodleSiteUrl,
          },
          synced_at: now,
          updated_at: now,
        },
        "user_id,moodle_assignment_id",
      );
      feedbackCount += 1;
    } else {
      await admin
        .from("moodle_feedback")
        .delete()
        .eq("user_id", userId)
        .eq("moodle_assignment_id", assignmentId)
        .eq("moodle_site_url", moodleSiteUrl);
    }

    const hash = evidenceHash(userId, courseId, assignmentId);
    syncedEvidenceHashes.add(hash);
    const linkedSkillId = resolveLinkedSkillId(declaredSkills, {
      courseName,
      courseShortname,
      assignmentName: name,
      competencyTags: competencyTags.length ? competencyTags : null,
    });
    const textPreview = [
      `${name} (${moduleType})`,
      grade !== null ? gradeFormatted : "Not graded",
      submissionStatus,
      courseCompletionStatus,
      statusFeedback.text,
    ]
      .filter(Boolean)
      .join(" · ")
      .slice(0, 500);

    const { data: lmsRows, error: lmsErr } = await admin
      .from("lms_evidence")
      .upsert(
        {
          user_id: userId,
          source: "Moodle LMS",
          moodle_site_url: moodleSiteUrl,
          course_name: courseName,
          course_code: courseShortname,
          grade: grade !== null ? gradeFormatted : null,
          completion_status: courseCompletionStatus ?? submissionStatus,
          evidence_hash: hash,
          linked_skill_id: linkedSkillId,
          raw: {
            courseId,
            assignmentId,
            moodle_site_url: moodleSiteUrl,
            assign: assign.raw,
            source: assign.source,
            submission,
            grade: gradeRow,
            feedback: statusFeedback.text,
          },
          text_preview: textPreview,
          fetched_at: now,
        },
        { onConflict: "user_id,evidence_hash" },
      )
      .select("id");

    if (lmsErr) {
      warnings.push(`lms_evidence save skipped for "${name}": ${lmsErr.message}`);
      logSyncStage("lms_evidence_upsert_skipped", { assignmentId, error: lmsErr.message });
    }

    const lmsEvidenceId = lmsRows?.[0]?.id ?? null;

    await dbUpsert(
      admin,
      "imported_lms_evidence",
      {
        user_id: userId,
        source: "Moodle LMS",
        moodle_site_url: moodleSiteUrl,
        moodle_course_id: courseId,
        moodle_assignment_id: assignmentId,
        course_name: courseName,
        activity_name: name,
        activity_type: moduleType === "assign" ? "Assignment" : moduleType,
        grade: grade !== null ? String(grade) : null,
        grade_max: gradeMax !== null ? String(gradeMax) : null,
        submission_status: submissionStatus,
        feedback_preview: statusFeedback.text,
        lms_evidence_id: lmsEvidenceId,
        imported_at: now,
        updated_at: now,
      },
      "user_id,moodle_assignment_id",
      false,
    );

    const matchedSkill = resolveCompetencyForMoodleAssignment(declaredSkills, {
      courseName,
      courseShortname,
      assignmentName: name,
      competencyTags: competencyTags.length ? competencyTags : null,
    });
    if (matchedSkill && grade !== null) {
      await upsertMoodleAssignmentEvidenceRecord(admin, {
        userId,
        skill: matchedSkill,
        moodleSiteUrl,
        moodleCourseId: courseId,
        moodleAssignmentId: assignmentId,
        courseName,
        assignmentName: name,
        grade,
        gradeMax,
        teacherFeedback: statusFeedback.text?.trim() || null,
        syncedAt: now,
        requireGrade: true,
      });
    }
  }

  for (const item of pendingGradeItems) {
    await dbUpsert(
      admin,
      "moodle_grades",
      {
        user_id: userId,
        moodle_course_id: item.courseId,
        moodle_site_url: moodleSiteUrl,
        item_id: item.itemId,
        item_name: item.itemName,
        item_type: item.itemType,
        grade: item.grade,
        grade_max: item.gradeMax,
        grade_formatted: item.gradeFormatted,
        raw: { ...item.raw, moodle_site_url: moodleSiteUrl },
        synced_at: now,
        updated_at: now,
      },
      "user_id,moodle_course_id,item_id",
      false,
    );
    syncedGradeKeys.add(`${item.courseId}:${item.itemId}`);
    if (item.grade !== null) gradeItemCount += 1;
  }

  const evidenceRepair = await repairMoodleEvidenceRecords(admin, userId);
  logSyncStage("moodle_evidence_repair", evidenceRepair);
  console.log("[moodle-evidence] Repair summary:", JSON.stringify(evidenceRepair));

  await linkUnmappedLmsEvidenceToSkills(admin, userId, declaredSkills);

  await upsertLmsConnection(
    admin,
    buildLmsConnectionRow({
      userId,
      moodleUserId,
      moodleEmail,
      institutionEmail,
      moodleSiteUrl,
      syncedAt: now,
      lastVerified: now,
    }),
  );

  if (courses.length === 0) {
    warnings.push("This Moodle account is connected but is not enrolled in any courses.");
  } else if (pendingAssignments.length === 0) {
    warnings.push("No assignments are currently available for your enrolled courses.");
  }

  const debug = {
    moodleUrl: moodleSiteUrl,
    userid: moodleUserId,
    sijilEmail: authEmail,
    moodleEmail,
    coursesFetched: courses.length,
    assignmentsFetched: pendingAssignments.length,
    gradesFetched: gradeItemCount,
    feedbackFetched: feedbackCount,
    completionFetched: completionCount,
  };

  logSyncStage("moodle_sync_debug", debug);
  console.log("Moodle Sync Debug:", JSON.stringify(debug, null, 2));

  const result = {
    success: true as const,
    moodleUserId,
    moodleSiteUrl,
    url: moodleSiteUrl,
    courses: courses.length,
    assignments: pendingAssignments.length,
    grades: gradeItemCount,
    feedback: feedbackCount,
    completion: completionCount,
    warnings,
    cleanup: cleanupStats,
    evidenceRepair,
    debug,
  };

  logSyncStage("sync_complete", { userId, ...result });
  return result;
}
