import { supabase } from "@/integrations/supabase/client";
import { isMissingColumnError, isMissingRelationError } from "@/lib/supabase-errors";

export const MOODLE_SITE_URL = "https://sijil.moodlecloud.com";

/** Expected edge function version — mismatch means remote deploy is stale. */
export const MOODLE_SYNC_FUNCTION_VERSION = "2.7.0";

export type MoodleSyncErrorCode =
  | "INVALID_MOODLE_TOKEN"
  | "MOODLE_API_UNAVAILABLE"
  | "MOODLE_ACCESS_DENIED"
  | "MOODLE_USER_NOT_FOUND"
  | "NO_ENROLLED_COURSES"
  | "NO_ASSIGNMENTS"
  | "DATABASE_TABLE_MISSING"
  | "DATABASE_INSERT_FAILED"
  | "INVALID_ACTION"
  | "MISSING_ACTION"
  | "UNAUTHORIZED"
  | "UNKNOWN";

type MoodleFunctionPayload = {
  error?: string;
  code?: string;
  hint?: string;
  details?: Record<string, unknown> | null;
  supportedActions?: string[];
  functionVersion?: string;
  success?: boolean;
  siteInfo?: { sitename?: string; sitefullname?: string };
  courses?: number;
  assignments?: number;
  grades?: number;
  warnings?: string[];
  moodleUserId?: number;
};

async function authHeaders(): Promise<Record<string, string>> {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseFunctionPayload(error: unknown, data: unknown): Promise<MoodleFunctionPayload | null> {
  if (data && typeof data === "object") {
    return data as MoodleFunctionPayload;
  }

  const ctx = (error as { context?: Response })?.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      return (await ctx.json()) as MoodleFunctionPayload;
    } catch {
      return null;
    }
  }
  return null;
}

function mapSyncError(payload: MoodleFunctionPayload | null, fallback: string): string {
  const code = payload?.code as MoodleSyncErrorCode | undefined;

  if (code === "INVALID_ACTION" || payload?.error === "Invalid action") {
    return (
      payload?.hint ??
      "Moodle sync function does not support this action. Check frontend/backend action names and redeploy: supabase functions deploy moodle-sync"
    );
  }

  if (code === "MISSING_ACTION") {
    return payload?.hint ?? 'Moodle sync request missing action. Expected { action: "sync_activities" }.';
  }

  switch (code) {
    case "INVALID_MOODLE_TOKEN":
      return "Invalid Moodle token. Contact your administrator to verify MOODLE_TOKEN.";
    case "MOODLE_API_UNAVAILABLE":
      return payload?.error ?? "Moodle API is unavailable. Try again later.";
    case "MOODLE_ACCESS_DENIED":
      return (
        payload?.error ??
        "Moodle token lacks permission to read assignment grades. Enable assignment and grade web service permissions in Moodle."
      );
    case "MOODLE_USER_NOT_FOUND":
      return payload?.error ?? "No Moodle account matched your SIJIL or institution email.";
    case "NO_ENROLLED_COURSES":
      return payload?.error ?? "No enrolled Moodle courses found for your account.";
    case "NO_ASSIGNMENTS":
      return payload?.error ?? "No Moodle assignments found.";
    case "DATABASE_TABLE_MISSING": {
      const hint = payload?.details?.hint as string | undefined;
      return (
        payload?.error ??
        `Moodle database tables are missing.${hint ? ` ${hint}` : " Run supabase/migrations/20260706120000_moodle_sync_tables.sql in Supabase SQL Editor."}`
      );
    }
    case "DATABASE_INSERT_FAILED":
      return payload?.error ?? "Failed to save Moodle data to the database.";
    default:
      return payload?.error ?? fallback;
  }
}

async function invokeMoodleFunction(body: Record<string, unknown>): Promise<MoodleFunctionPayload> {
  const headers = await authHeaders();
  const { data, error } = await supabase.functions.invoke("moodle-sync", { body, headers });

  const payload = await parseFunctionPayload(error, data);

  if (error || payload?.error) {
    throw new Error(mapSyncError(payload, error?.message ?? "Moodle request failed"));
  }

  if (!payload) {
    throw new Error("Empty response from moodle-sync edge function.");
  }

  return payload;
}

export type MoodleConnection = {
  user_id: string;
  moodle_user_id: number | null;
  moodle_email: string | null;
  institution_email: string | null;
  last_synced_at: string | null;
};

function rowToMoodleConnection(row: Record<string, unknown>): MoodleConnection {
  return {
    user_id: String(row.user_id),
    moodle_user_id: row.moodle_user_id != null ? Number(row.moodle_user_id) : null,
    moodle_email: typeof row.moodle_email === "string" ? row.moodle_email : null,
    institution_email: typeof row.institution_email === "string" ? row.institution_email : null,
    last_synced_at: typeof row.last_synced_at === "string" ? row.last_synced_at : null,
  };
}

/** Detect Moodle link from columns that exist on the row (no provider filter). */
function isMoodleConnectionRow(row: Record<string, unknown>): boolean {
  if (row.moodle_user_id != null) return true;
  // Moodle sync sets last_synced_at; Odoo connections set odoo_url / has_api_key
  const hasOdoo = Boolean(String(row.odoo_url ?? "").trim()) || row.has_api_key === true;
  return Boolean(row.last_synced_at) && !hasOdoo;
}

export type MoodleCourseActivity = {
  courseId: number;
  courseName: string;
  shortname: string | null;
  assignments: MoodleAssignmentActivity[];
};

export type MoodleAssignmentActivity = {
  id: string;
  moodleAssignmentId: number;
  name: string;
  moduleType: string;
  activityType: string;
  submissionStatus: string;
  grade: string | null;
  gradeMax: string | null;
  gradeFormatted: string | null;
  feedback: string | null;
  submissionText: string | null;
  submissionFiles: string[] | null;
  gradedAt: string | null;
  submittedAt: string | null;
  gradeReleased: boolean;
  competencyTags: string[];
  importedAt: string;
  source: string;
};

export type MoodleSyncResult = {
  courses: number;
  assignments: number;
  grades: number;
  warnings: string[];
  functionVersion?: string;
};

async function requireUserId(): Promise<string> {
  const { data: auth, error } = await supabase.auth.getUser();
  if (error || !auth.user) throw new Error("Sign in required.");
  return auth.user.id;
}

export async function testMoodleConnection(): Promise<{
  ok: boolean;
  siteName?: string;
  functionVersion?: string;
  staleDeploy?: boolean;
  error?: string;
}> {
  try {
    const payload = await invokeMoodleFunction({ action: "test" });
    const version = payload.functionVersion;
    return {
      ok: true,
      siteName: payload.siteInfo?.sitename ?? payload.siteInfo?.sitefullname,
      functionVersion: version,
      staleDeploy: !!version && version !== MOODLE_SYNC_FUNCTION_VERSION,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Moodle connection failed",
    };
  }
}

export async function syncMoodleActivities(): Promise<MoodleSyncResult> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) {
    throw new Error("Sign in required to sync Moodle activities.");
  }

  const payload = await invokeMoodleFunction({ action: "sync_activities" });

  return {
    courses: payload.courses ?? 0,
    assignments: payload.assignments ?? 0,
    grades: payload.grades ?? 0,
    warnings: payload.warnings ?? [],
    functionVersion: payload.functionVersion,
  };
}

/** Legacy course-only import when an old edge function lacks sync_activities. */
export async function legacyImportMoodleCourses(): Promise<number> {
  const payload = await invokeMoodleFunction({ action: "get_courses" });
  const courses = Array.isArray((payload as { courses?: unknown[] }).courses)
    ? (payload as { courses: unknown[] }).courses
    : [];
  return courses.length;
}

export async function fetchMoodleConnection(): Promise<MoodleConnection | null> {
  const userId = await requireUserId();

  const { data, error } = await supabase
    .from("lms_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (isMissingRelationError(error)) return null;
    throw error;
  }

  if (!data || !isMoodleConnectionRow(data as Record<string, unknown>)) {
    return null;
  }

  return rowToMoodleConnection(data as Record<string, unknown>);
}

export async function disconnectMoodle(): Promise<void> {
  const userId = await requireUserId();

  const { data: row, error: readErr } = await supabase
    .from("lms_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (readErr && !isMissingRelationError(readErr)) throw readErr;
  if (!row || !isMoodleConnectionRow(row as Record<string, unknown>)) return;

  const record = row as Record<string, unknown>;
  const hasOdoo = Boolean(String(record.odoo_url ?? "").trim()) || record.has_api_key === true;

  if (hasOdoo) {
    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if ("moodle_user_id" in record) updatePayload.moodle_user_id = null;
    if ("moodle_email" in record) updatePayload.moodle_email = null;
    if ("institution_email" in record) updatePayload.institution_email = null;

    const { error } = await supabase
      .from("lms_connections")
      .update(updatePayload)
      .eq("user_id", userId);
    if (error && !isMissingColumnError(error)) throw error;
    return;
  }

  const { error } = await supabase.from("lms_connections").delete().eq("user_id", userId);
  if (error) throw error;
}

export async function fetchMoodleCourseActivities(): Promise<MoodleCourseActivity[]> {
  const userId = await requireUserId();

  const { data: courses, error: courseErr } = await supabase
    .from("moodle_courses")
    .select("moodle_course_id,fullname,shortname")
    .eq("user_id", userId)
    .order("synced_at", { ascending: false });

  if (courseErr) {
    if (isMissingRelationError(courseErr)) {
      console.warn("moodle_courses table missing — run migration 20260706120000_moodle_sync_tables.sql");
      return [];
    }
    throw courseErr;
  }

  const { data: assignments, error: assignErr } = await supabase
    .from("moodle_assignments")
    .select(
      "id,moodle_course_id,moodle_assignment_id,name,module_type,submission_status,grade,grade_max,grade_formatted,graded_at,submitted_at,grade_released,submission_text,submission_files,competency_tags,synced_at",
    )
    .eq("user_id", userId)
    .order("synced_at", { ascending: false });

  if (assignErr) {
    if (isMissingRelationError(assignErr)) return [];
    throw assignErr;
  }

  const { data: feedbackRows, error: fbErr } = await supabase
    .from("moodle_feedback")
    .select("moodle_assignment_id,feedback_text")
    .eq("user_id", userId);

  if (fbErr && !isMissingRelationError(fbErr)) throw fbErr;

  const feedbackMap = new Map(
    (feedbackRows ?? []).map((f) => [Number(f.moodle_assignment_id), f.feedback_text as string | null]),
  );

  const assignByCourse = new Map<number, MoodleAssignmentActivity[]>();
  for (const row of assignments ?? []) {
    const courseId = Number(row.moodle_course_id);
    const moodleAssignmentId = Number(row.moodle_assignment_id);
    const list = assignByCourse.get(courseId) ?? [];
    const tagsRaw = row.competency_tags;
    let competencyTags: string[] = [];
    if (Array.isArray(tagsRaw)) {
      competencyTags = tagsRaw.map(String);
    } else if (typeof tagsRaw === "string") {
      try {
        const parsed = JSON.parse(tagsRaw);
        if (Array.isArray(parsed)) competencyTags = parsed.map(String);
      } catch {
        competencyTags = [];
      }
    }

    const filesRaw = row.submission_files;
    let submissionFiles: string[] | null = null;
    if (Array.isArray(filesRaw)) {
      submissionFiles = filesRaw.map(String);
    } else if (typeof filesRaw === "string") {
      try {
        const parsed = JSON.parse(filesRaw);
        if (Array.isArray(parsed)) submissionFiles = parsed.map(String);
      } catch {
        submissionFiles = null;
      }
    }

    list.push({
      id: row.id as string,
      moodleAssignmentId,
      name: row.name as string,
      moduleType: (row.module_type as string) ?? "assign",
      activityType: (row.module_type as string) === "assign" ? "Assignment" : (row.module_type as string),
      submissionStatus: (row.submission_status as string) ?? "Pending",
      grade: row.grade !== null && row.grade !== undefined ? String(row.grade) : null,
      gradeMax: row.grade_max !== null && row.grade_max !== undefined ? String(row.grade_max) : null,
      gradeFormatted: (row.grade_formatted as string) ?? null,
      feedback: feedbackMap.get(moodleAssignmentId) ?? null,
      submissionText: (row.submission_text as string) ?? null,
      submissionFiles,
      gradedAt: (row.graded_at as string) ?? null,
      submittedAt: (row.submitted_at as string) ?? null,
      gradeReleased: Boolean(row.grade_released),
      competencyTags,
      importedAt: (row.synced_at as string) ?? new Date().toISOString(),
      source: "Moodle LMS",
    });
    assignByCourse.set(courseId, list);
  }

  return (courses ?? []).map((c) => ({
    courseId: Number(c.moodle_course_id),
    courseName: (c.fullname as string) || (c.shortname as string) || `Course ${c.moodle_course_id}`,
    shortname: (c.shortname as string) ?? null,
    assignments: assignByCourse.get(Number(c.moodle_course_id)) ?? [],
  }));
}

export function hasMoodleAccessControlWarning(warnings: string[]): boolean {
  return warnings.some((w) => {
    const lower = w.toLowerCase();
    return (
      lower.includes("access denied") ||
      lower.includes("access control") ||
      lower.includes("lacks permission") ||
      lower.includes("grade access denied") ||
      lower.includes("permission required")
    );
  });
}

export function activityStatusBadge(status: string): "verified" | "info" | "warning" | "neutral" {
  const s = status.toLowerCase();
  if (s === "graded") return "verified";
  if (s === "submitted") return "info";
  if (s === "grade access denied" || s === "permission required") return "warning";
  if (s === "pending" || s === "not started") return "warning";
  return "neutral";
}

export function formatMoodleFeedbackDisplay(feedback: string | null | undefined): string {
  if (feedback?.trim()) return feedback.trim();
  return "No teacher feedback provided.";
}

export function formatGradeDisplay(a: MoodleAssignmentActivity): string {
  const status = a.submissionStatus.toLowerCase();
  if (status === "grade access denied" || status === "permission required") {
    return a.submissionStatus;
  }
  if (a.gradeFormatted && a.gradeFormatted !== "—") return a.gradeFormatted;
  if (a.grade && a.gradeMax) return `${a.grade} / ${a.gradeMax}`;
  if (a.grade) return a.grade;
  if (!a.gradeReleased && a.submissionStatus === "Submitted") return "Grade not released yet";
  return "—";
}
