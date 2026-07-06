/**
 * Moodle LMS sync core — fetches courses, assignments, submissions, grades, feedback
 * and upserts into Supabase moodle_* + lms_evidence tables.
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MOODLE_URL = Deno.env.get("MOODLE_URL");
const MOODLE_TOKEN = Deno.env.get("MOODLE_TOKEN");

function getMoodleBaseUrl(): string {
  const raw = MOODLE_URL?.trim().replace(/\/+$/, "") ?? "";
  if (!raw) {
    throw new MoodleSyncError("INVALID_MOODLE_TOKEN", "Moodle is not configured (missing MOODLE_URL).");
  }
  return raw;
}

async function parseMoodleJsonResponse(
  res: Response,
  context: string,
): Promise<Record<string, unknown>> {
  const contentType = res.headers.get("content-type") ?? "";
  const bodyText = await res.text();

  if (!bodyText.trim()) {
    throw new MoodleSyncError("MOODLE_API_UNAVAILABLE", `${context}: empty response from Moodle.`, {
      httpStatus: res.status,
    });
  }

  const looksHtml = bodyText.trimStart().startsWith("<") ||
    contentType.includes("text/html");
  if (looksHtml) {
    logSyncStage("moodle_html_response", {
      context,
      httpStatus: res.status,
      contentType,
      preview: bodyText.slice(0, 200),
    });
    throw new MoodleSyncError(
      "MOODLE_API_UNAVAILABLE",
      "Moodle server returned HTML instead of JSON. Check MOODLE_URL in Supabase secrets (e.g. https://sijil.moodlecloud.com).",
      { context, httpStatus: res.status },
    );
  }

  try {
    return JSON.parse(bodyText) as Record<string, unknown>;
  } catch {
    logSyncStage("moodle_json_parse_failed", {
      context,
      httpStatus: res.status,
      contentType,
      preview: bodyText.slice(0, 200),
    });
    throw new MoodleSyncError(
      "MOODLE_API_UNAVAILABLE",
      `${context}: invalid JSON from Moodle.`,
      { httpStatus: res.status },
    );
  }
}

export type MoodleSyncErrorCode =
  | "INVALID_MOODLE_TOKEN"
  | "MOODLE_API_UNAVAILABLE"
  | "MOODLE_ACCESS_DENIED"
  | "MOODLE_USER_NOT_FOUND"
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
  const { error } = await admin.from(table).upsert(row, { onConflict });
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

  const result = await tryCallMoodle("gradereport_user_get_grade_items", {
    userid: moodleUserId,
    courseid: courseId,
  });

  if (!result.ok) {
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

  const items =
    (result.data as { usergrades?: { gradeitems?: Record<string, unknown>[] }[] })?.usergrades?.[0]
      ?.gradeitems ?? [];

  for (const item of items) {
    if (String(item.itemmodule ?? "") !== "assign") continue;

    const instanceId = Number(item.iteminstance);
    if (!instanceId) continue;

    const gradeFormattedRaw = item.gradeformatted ? String(item.gradeformatted) : null;
    let grade = parseMoodleGrade(item.grade ?? item.graderaw);
    if (grade === null && gradeFormattedRaw) {
      const match = gradeFormattedRaw.match(/^([\d.]+)/);
      if (match) grade = parseMoodleGrade(match[1]);
    }
    const gradeMax = parseNum(item.grademax);
    const feedbackRaw = item.feedback ?? item.feedbackcontent ?? null;
    const feedback = feedbackRaw ? stripHtml(String(feedbackRaw)) : null;

    const parsed: GradeReportItem = {
      grade,
      gradeMax,
      gradeFormatted: gradeFormattedRaw ?? gradeDisplay(grade, gradeMax),
      feedback,
      itemName: String(item.itemname ?? ""),
      raw: item,
    };

    byAssignmentId.set(instanceId, parsed);
    if (parsed.itemName) byName.set(normalizeActivityName(parsed.itemName), parsed);
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
  if (!MOODLE_URL || !MOODLE_TOKEN) {
    throw new MoodleSyncError(
      "INVALID_MOODLE_TOKEN",
      "Moodle is not configured (missing MOODLE_URL or MOODLE_TOKEN).",
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
    res = await fetch(`${getMoodleBaseUrl()}/webservice/rest/server.php`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });
  } catch {
    throw new MoodleSyncError("MOODLE_API_UNAVAILABLE", "Could not reach the Moodle server.");
  }

  const data = await parseMoodleJsonResponse(res, wsfunction);

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
      httpStatus: res.status,
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

/** Upsert lms_connections; fall back to base columns when Moodle fields are not migrated yet. */
async function upsertLmsConnection(
  admin: SupabaseClient,
  row: Record<string, unknown>,
) {
  logSyncStage("lms_connection_upsert_start", { user_id: row.user_id });
  const { error } = await admin.from("lms_connections").upsert(row, { onConflict: "user_id" });
  if (!error) {
    logSyncStage("lms_connection_upsert_ok", { user_id: row.user_id });
    return;
  }

  const message = error.message ?? "";
  logSyncStage("lms_connection_upsert_fallback", { user_id: row.user_id, error: message });
  if (!message.includes("does not exist")) {
    throw new MoodleSyncError("DATABASE_INSERT_FAILED", `Failed to update lms_connections: ${message}`, {
      table: "lms_connections",
    });
  }

  const { error: fallbackErr } = await admin.from("lms_connections").upsert(
    {
      user_id: row.user_id,
      last_synced_at: row.last_synced_at,
      updated_at: row.updated_at,
    },
    { onConflict: "user_id" },
  );
  if (fallbackErr) {
    throw new MoodleSyncError("DATABASE_INSERT_FAILED", `Failed to update lms_connections: ${fallbackErr.message}`, {
      table: "lms_connections",
    });
  }
  logSyncStage("lms_connection_upsert_ok_minimal", { user_id: row.user_id });
}

type MoodleUser = { id: number; email?: string; fullname?: string };

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
  const n = parseNum(v);
  if (n === null || n < 0) return null;
  return n;
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

function extractCommentsFeedbackFromPlugins(
  plugins: unknown[],
  context: { assignmentId: number; moodleUserId: number; source: string },
): { text: string | null; detectedPlugin: Record<string, unknown> | null } {
  logSyncStage("feedback_plugins_inspect", {
    ...context,
    pluginCount: plugins.length,
    rawPlugins: plugins,
    pluginSummaries: plugins.map((p) => summarizePluginStructure(p as Record<string, unknown>)),
  });

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

  let submissionStatusRaw: Record<string, unknown> | null = null;
  const statusResult = await tryCallMoodle("mod_assign_get_submission_status", {
    assignid: assignmentId,
    userid: moodleUserId,
  });

  if (statusResult.ok) {
    submissionStatusRaw = statusResult.data as Record<string, unknown>;
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
  } else {
    logSyncStage("mod_assign_get_submission_status_failed", {
      wsfunction: statusResult.wsfunction,
      assignmentId,
      moodleUserId,
      accessDenied: statusResult.accessDenied,
      error: statusResult.message,
    });
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
    String(submission?.gradingstatus ?? (gradeRow ? "graded" : "")),
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
  assignApiAccessDenied: boolean;
  failedFunctions: string[];
}> {
  let submission: Record<string, unknown> | undefined;
  let gradeRow: Record<string, unknown> | undefined;
  const failedFunctions: string[] = [];
  let assignApiAccessDenied = false;

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

  const gradeResult = await tryCallMoodle("mod_assign_get_grades", {
    assignmentids: [assignmentId],
  });

  if (gradeResult.ok) {
    const gradeData = gradeResult.data as { assignments?: { assignmentid?: number; grades?: Record<string, unknown>[] }[] };
    const block = (gradeData?.assignments ?? []).find(
      (b) => Number(b.assignmentid) === assignmentId,
    ) ?? gradeData?.assignments?.[0];

    gradeRow = (block?.grades ?? []).find(
      (g) => Number(g.userid) === moodleUserId,
    ) as Record<string, unknown> | undefined;

    logSyncStage("mod_assign_get_grades_result", {
      courseId,
      courseName,
      assignmentId,
      moodleUserId,
      gradeCount: (block?.grades ?? []).length,
      foundForUser: Boolean(gradeRow),
      grade: gradeRow?.grade ?? null,
      timemodified: gradeRow?.timemodified ?? null,
      grader: gradeRow?.grader ?? null,
      grade_plugins: gradeRow?.plugins ?? null,
      grade_feedback: gradeRow?.feedback ?? null,
      grade_feedbacktext: gradeRow?.feedbacktext ?? null,
      gradeKeys: gradeRow ? Object.keys(gradeRow) : [],
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

  return { submission, gradeRow, assignApiAccessDenied, failedFunctions };
}

export type SyncActivitiesResult = {
  success: true;
  moodleUserId: number;
  courses: number;
  assignments: number;
  grades: number;
  warnings: string[];
};

export async function syncLearnerMoodleActivities(
  admin: SupabaseClient,
  userId: string,
  authEmail: string | null,
  institutionEmail: string | null,
): Promise<SyncActivitiesResult> {
  logSyncStage("sync_start", { userId, authEmail, institutionEmail });

  const emails = [authEmail, institutionEmail].filter(Boolean) as string[];
  if (!emails.length) {
    throw new MoodleSyncError("MOODLE_USER_NOT_FOUND", "No email available to match your Moodle account.");
  }

  logSyncStage("find_moodle_user", { emailsTried: emails });
  const moodleUser = await findMoodleUserByEmails(emails);
  if (!moodleUser?.id) {
    throw new MoodleSyncError(
      "MOODLE_USER_NOT_FOUND",
      "No Moodle account found for your SIJIL or institution email.",
      { emailsTried: emails },
    );
  }

  const moodleUserId = Number(moodleUser.id);
  logSyncStage("moodle_user_found", { userId, moodleUserId, moodleEmail: moodleUser.email });
  const now = new Date().toISOString();
  const warnings: string[] = [];

  await upsertLmsConnection(admin, {
    user_id: userId,
    moodle_user_id: moodleUserId,
    moodle_email: moodleUser.email ?? authEmail,
    institution_email: institutionEmail,
    last_synced_at: now,
    updated_at: now,
  });

  logSyncStage("fetch_enrolled_courses", { moodleUserId });
  const enrolled = await callMoodle("core_enrol_get_users_courses", { userid: moodleUserId });
  const courses = (Array.isArray(enrolled) ? enrolled : []).filter(
    (c: { id?: number }) => c?.id && Number(c.id) > 1,
  );

  logSyncStage("enrolled_courses_result", {
    moodleUserId,
    courseCount: courses.length,
    courseIds: courses.map((c: { id?: number }) => Number(c.id)),
    courseNames: courses.map((c: { fullname?: string; shortname?: string; id?: number }) =>
      c.fullname || c.shortname || `Course ${c.id}`,
    ),
  });

  if (!courses.length) {
    throw new MoodleSyncError("NO_ENROLLED_COURSES", "No enrolled Moodle courses found for your account.", {
      moodleUserId,
    });
  }

  let assignmentCount = 0;
  let gradeItemCount = 0;
  let gradePermissionWarningAdded = false;

  for (const course of courses) {
    const courseId = Number(course.id);
    const courseName = course.fullname || course.shortname || `Course ${courseId}`;

    await dbUpsert(
      admin,
      "moodle_courses",
      {
        user_id: userId,
        moodle_course_id: courseId,
        fullname: courseName,
        shortname: course.shortname ?? null,
        summary: course.summary ? stripHtml(String(course.summary)).slice(0, 2000) : null,
        raw: course,
        synced_at: now,
        updated_at: now,
      },
      "user_id,moodle_course_id",
    );

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

    let savedInCourse = 0;

    logSyncStage("process_course_assignments", {
      courseId,
      courseName,
      moodleUserId,
      assignmentIds: courseAssignments.map((a) => a.id),
      assignmentNames: courseAssignments.map((a) => a.name),
    });

    for (const assign of courseAssignments) {
      const assignmentId = assign.id;
      const cmid = assign.cmid ?? (assign.raw.cmid ? Number(assign.raw.cmid) : null);
      const modInfo = cmid ? moduleMap.get(cmid) : undefined;
      const moduleType = "assign";
      const name = assign.name;

      const reportItem =
        gradeReport.byAssignmentId.get(assignmentId) ??
        gradeReport.byName.get(normalizeActivityName(name)) ??
        null;

      const { submission, gradeRow, assignApiAccessDenied: itemAssignDenied, failedFunctions } =
        await fetchAssignmentSubmissionAndGrade(
          assignmentId,
          moodleUserId,
          courseId,
          courseName,
        );

      let grade = parseMoodleGrade(gradeRow?.grade);
      let gradeMax = assign.gradeMax ?? parseNum(assign.raw.grade) ?? reportItem?.gradeMax ?? null;

      if (grade === null && reportItem?.grade !== null && reportItem?.grade !== undefined) {
        grade = reportItem.grade;
        logSyncStage("grade_from_report_fallback", {
          courseId,
          assignmentId,
          assignmentName: name,
          moodleUserId,
          grade,
          gradeMax: reportItem.gradeMax,
          source: "gradereport_user_get_grade_items",
        });
      } else if (
        grade === null &&
        reportItem?.gradeFormatted &&
        reportItem.gradeFormatted !== "—"
      ) {
        const match = reportItem.gradeFormatted.match(/^([\d.]+)/);
        if (match) {
          grade = parseMoodleGrade(match[1]);
          logSyncStage("grade_from_report_formatted_fallback", {
            courseId,
            assignmentId,
            assignmentName: name,
            gradeFormatted: reportItem.gradeFormatted,
            parsedGrade: grade,
          });
        }
      }
      if (gradeMax === null && reportItem?.gradeMax !== null) {
        gradeMax = reportItem.gradeMax;
      }

      const gradeReleased =
        grade !== null ||
        String(submission?.gradingstatus ?? gradeRow?.gradingstatus ?? "").toLowerCase() === "graded";

      const assignApisDenied = courseAssignApiDenied || itemAssignDenied;
      const submissionStatus = resolveAssignmentStatus(
        submission,
        gradeRow,
        reportItem,
        grade,
        gradeReleased,
        assignApisDenied && grade === null,
      );

      const statusFeedback = await resolveTeacherFeedback(
        assignmentId,
        moodleUserId,
        gradeRow,
        courseId,
      );
      const { submissionText, submissionFiles } = extractStudentSubmission(submission);

      const gradeFormatted = reportItem?.gradeFormatted ?? gradeDisplay(grade, gradeMax);

      logSyncStage("assignment_feedback_extracted", {
        courseId,
        courseName,
        assignmentId,
        assignmentName: name,
        moodleUserId,
        grade,
        gradeMax,
        gradeFormatted,
        submissionStatus,
        gradeSource: gradeRow ? "mod_assign_get_grades" : reportItem?.grade !== null ? "gradereport_user_get_grade_items" : null,
        failedFunctions: failedFunctions.length ? failedFunctions : null,
        teacherFeedbackText: statusFeedback.text,
        teacherFeedbackSource: statusFeedback.source,
        submissionTextPreview: submissionText?.slice(0, 120) ?? null,
        submissionFileCount: submissionFiles?.length ?? 0,
      });

      const gradedAt = tsToIso(gradeRow?.timemodified ?? gradeRow?.timecreated);
      const submittedAt = tsToIso(submission?.timemodified ?? submission?.timecreated);

      if (grade === null && submissionStatus === "Submitted") {
        warnings.push(`Grade not released yet for "${name}" in ${courseName}`);
      }
      if (submissionStatus === "Grade access denied") {
        warnings.push(`Grade access denied for "${name}" in ${courseName} — Moodle token needs assignment/grade permissions.`);
      }

      if (grade !== null) gradeItemCount += 1;

      await dbUpsert(
        admin,
        "moodle_assignments",
        {
          user_id: userId,
          moodle_course_id: courseId,
          moodle_assignment_id: assignmentId,
          moodle_cmid: cmid,
          name,
          module_type: moduleType,
          submission_status: submissionStatus,
          grade,
          grade_max: gradeMax,
          grade_formatted: gradeFormatted,
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
            grade: gradeRow,
            gradeReport: reportItem?.raw ?? null,
            failedFunctions: failedFunctions.length ? failedFunctions : null,
            teacherFeedbackPlugin: statusFeedback.detectedPlugin,
          },
          synced_at: now,
          updated_at: now,
        },
        "user_id,moodle_assignment_id",
      );

      savedInCourse += 1;

      await dbUpsert(
        admin,
        "moodle_feedback",
        {
          user_id: userId,
          moodle_assignment_id: assignmentId,
          feedback_text: statusFeedback.text,
          grader_id: statusFeedback.graderId,
          raw: {
            source: statusFeedback.source ?? "mod_assign_get_grades",
            gradePlugins: (gradeRow?.plugins as unknown[]) ?? null,
            detectedFeedbackPlugin: statusFeedback.detectedPlugin,
            gradeRow: gradeRow ?? null,
            debug: statusFeedback.rawDebug,
          },
          synced_at: now,
          updated_at: now,
        },
        "user_id,moodle_assignment_id",
      );

      const hash = evidenceHash(userId, courseId, assignmentId);
      const textPreview = [
        `${name} (${moduleType})`,
        gradeDisplay(grade, gradeMax),
        submissionStatus,
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
            course_name: courseName,
            course_code: course.shortname ?? null,
            grade: gradeDisplay(grade, gradeMax),
            completion_status: submissionStatus,
            evidence_hash: hash,
            raw: { courseId, assignmentId, assign: assign.raw, source: assign.source, submission, grade: gradeRow, feedback: statusFeedback.text },
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
    }

    assignmentCount += savedInCourse;
    logSyncStage("course_assignments_saved", {
      courseId,
      courseName,
      savedAssignmentCount: savedInCourse,
      totalAssignmentsSaved: assignmentCount,
    });

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
          await dbUpsert(
            admin,
            "moodle_grades",
            {
              user_id: userId,
              moodle_course_id: courseId,
              item_id: itemId,
              item_name: String(item.itemname ?? "Grade item"),
              item_type: item.itemmodule ?? item.itemtype ?? null,
              grade: itemGrade,
              grade_max: itemMax,
              grade_formatted: item.gradeformatted ? String(item.gradeformatted) : gradeDisplay(itemGrade, itemMax),
              raw: item,
              synced_at: now,
              updated_at: now,
            },
            "user_id,moodle_course_id,item_id",
            false,
          );
          gradeItemCount += 1;
        }
      } else if (reportResult.accessDenied) {
        logSyncStage("gradereport_non_assign_skipped", {
          courseId,
          courseName,
          wsfunction: reportResult.wsfunction,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`Grade report unavailable for ${courseName}: ${msg}`);
    }
  }

  if (assignmentCount === 0) {
    warnings.push("No Moodle assignments found in your enrolled courses.");
  }

  const result = {
    success: true as const,
    moodleUserId,
    courses: courses.length,
    assignments: assignmentCount,
    grades: gradeItemCount,
    warnings,
  };

  logSyncStage("sync_complete", { userId, ...result });
  return result;
}
