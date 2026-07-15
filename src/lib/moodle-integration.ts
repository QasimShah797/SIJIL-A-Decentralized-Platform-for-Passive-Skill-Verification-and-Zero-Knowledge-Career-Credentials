import { supabase } from "@/integrations/supabase/client";
import { isMissingColumnError, isMissingRelationError } from "@/lib/supabase-errors";

export const MOODLE_SITE_URL = "https://sijil-fyp.moodlecloud.com";

/** Hostname of the only supported MoodleCloud instance. */
export const CURRENT_MOODLE_SITE_HOST = "sijil-fyp.moodlecloud.com";

/** Legacy MoodleCloud host — must never be shown in UI. */
export const LEGACY_MOODLE_SITE_HOST = "sijil.moodlecloud.com";

/** Expected edge function version — mismatch means remote deploy is stale. */
export const MOODLE_SYNC_FUNCTION_VERSION = "3.4.0";

export function normalizeMoodleSiteUrl(url: string): string {
  return url.trim().replace(/\/+$/, "").toLowerCase();
}

export function displayMoodleSiteHost(url: string = MOODLE_SITE_URL): string {
  try {
    const host = new URL(url.startsWith("http") ? url : `https://${url}`).host.toLowerCase();
    if (host === LEGACY_MOODLE_SITE_HOST || (host.includes("moodlecloud.com") && !host.includes("sijil-fyp"))) {
      return CURRENT_MOODLE_SITE_HOST;
    }
    return host;
  } catch {
    const stripped = url.replace(/^https?:\/\//, "").replace(/\/+$/, "").toLowerCase();
    if (stripped === LEGACY_MOODLE_SITE_HOST) return CURRENT_MOODLE_SITE_HOST;
    return stripped;
  }
}

/** True when URL belongs to the current sijil-fyp MoodleCloud site. */
export function isCurrentMoodleSiteUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  return displayMoodleSiteHost(url) === CURRENT_MOODLE_SITE_HOST;
}

/** True when URL points at the retired sijil.moodlecloud.com instance. */
export function isLegacyMoodleSiteUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  const host = displayMoodleSiteHost(url);
  const normalized = normalizeMoodleSiteUrl(url);
  return (
    host === LEGACY_MOODLE_SITE_HOST ||
    normalized.includes(LEGACY_MOODLE_SITE_HOST) ||
    (normalized.includes("moodlecloud.com") && !normalized.includes("sijil-fyp"))
  );
}

/**
 * Resolve the Moodle site URL for display from the connection record.
 * Stale/legacy URLs are replaced with the canonical current site.
 */
export function resolveMoodleConnectionSiteUrl(
  connection: { moodle_site_url: string | null } | null | undefined,
): string {
  const stored = connection?.moodle_site_url;
  if (stored && isCurrentMoodleSiteUrl(stored)) {
    return normalizeMoodleSiteUrl(stored);
  }
  return normalizeMoodleSiteUrl(MOODLE_SITE_URL);
}

export function resolveMoodleConnectionSiteHost(
  connection: { moodle_site_url: string | null } | null | undefined,
): string {
  return displayMoodleSiteHost(resolveMoodleConnectionSiteUrl(connection));
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
  feedback?: number;
  completion?: number;
  warnings?: string[];
  moodleUserId?: number;
  moodleSiteUrl?: string;
  url?: string;
  cleanup?: Record<string, number>;
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
      return payload?.error ?? "No Moodle account matched your SIJIL email.";
    case "MOODLE_EMAIL_MISMATCH":
      return payload?.error ?? "Moodle account email does not match SIJIL account email";
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
  moodle_site_url: string | null;
  last_synced_at: string | null;
};

function rowToMoodleConnection(row: Record<string, unknown>): MoodleConnection {
  const rawSiteUrl = typeof row.moodle_site_url === "string" ? row.moodle_site_url : null;
  const moodle_site_url = rawSiteUrl && isCurrentMoodleSiteUrl(rawSiteUrl)
    ? normalizeMoodleSiteUrl(rawSiteUrl)
    : rawSiteUrl && isLegacyMoodleSiteUrl(rawSiteUrl)
      ? normalizeMoodleSiteUrl(MOODLE_SITE_URL)
      : rawSiteUrl;
  return {
    user_id: String(row.user_id),
    moodle_user_id: row.moodle_user_id != null ? Number(row.moodle_user_id) : null,
    moodle_email: typeof row.moodle_email === "string" ? row.moodle_email : null,
    institution_email: typeof row.institution_email === "string" ? row.institution_email : null,
    moodle_site_url,
    last_synced_at: typeof row.last_synced_at === "string" ? row.last_synced_at : null,
  };
}

async function repairStaleMoodleConnectionSiteUrl(userId: string, siteUrl: string | null): Promise<string | null> {
  if (!siteUrl || isCurrentMoodleSiteUrl(siteUrl)) return siteUrl;
  if (!isLegacyMoodleSiteUrl(siteUrl)) return siteUrl;

  const canonical = normalizeMoodleSiteUrl(MOODLE_SITE_URL);
  const { error } = await supabase
    .from("lms_connections")
    .update({ moodle_site_url: canonical, updated_at: new Date().toISOString() })
    .eq("user_id", userId);

  if (error && !isMissingColumnError(error)) {
    console.warn("Could not repair stale moodle_site_url in lms_connections:", error.message);
    return canonical;
  }

  console.info("[Moodle] Repaired legacy moodle_site_url in lms_connections →", canonical);
  return canonical;
}

/** Detect Moodle link from columns that exist on the row (no provider filter). */
function isMoodleConnectionRow(row: Record<string, unknown>): boolean {
  if (row.moodle_user_id != null) return true;
  const hasOdoo = Boolean(String(row.odoo_url ?? "").trim()) || row.has_api_key === true;
  return Boolean(row.last_synced_at) && !hasOdoo;
}

export type MoodleCourseActivity = {
  courseId: number;
  courseName: string;
  shortname: string | null;
  completionStatus: string | null;
  progress: string | null;
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
  dueDate: string | null;
  gradeReleased: boolean;
  competencyTags: string[];
  importedAt: string;
  source: string;
};

export type MoodleSyncResult = {
  courses: number;
  assignments: number;
  grades: number;
  feedback: number;
  completion: number;
  warnings: string[];
  functionVersion?: string;
  moodleSiteUrl?: string;
  url?: string;
  cleanup?: Record<string, number>;
  debug?: MoodleFunctionPayload["debug"];
};

function mapSyncPayload(payload: MoodleFunctionPayload): MoodleSyncResult {
  return {
    courses: payload.courses ?? 0,
    assignments: payload.assignments ?? 0,
    grades: payload.grades ?? 0,
    feedback: payload.feedback ?? 0,
    completion: payload.completion ?? 0,
    warnings: payload.warnings ?? [],
    functionVersion: payload.functionVersion,
    moodleSiteUrl: payload.moodleSiteUrl ?? payload.url,
    url: payload.url ?? payload.moodleSiteUrl ?? MOODLE_SITE_URL,
    cleanup: payload.cleanup ?? undefined,
    debug: payload.debug,
  };
}

export async function syncMoodleActivities(): Promise<MoodleSyncResult> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) {
    throw new Error("Sign in required to sync Moodle activities.");
  }

  const payload = await invokeMoodleFunction({ action: "sync_activities", force: true });
  return mapSyncPayload(payload);
}

/** Backfill evidence_records from existing moodle_assignments without re-fetching Moodle. */
export async function repairMoodleEvidenceRecords(): Promise<{
  assignmentsFound: number;
  evidenceCreated: number;
  evidenceUpdated: number;
  unmatchedAssignments: number;
  logs: string[];
}> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) {
    throw new Error("Sign in required to repair Moodle evidence records.");
  }

  const payload = await invokeMoodleFunction({ action: "repair_moodle_evidence_records" });
  const result = (payload as { result?: Record<string, unknown> }).result ?? payload;

  return {
    assignmentsFound: Number(result.assignmentsFound ?? 0),
    evidenceCreated: Number(result.evidenceCreated ?? 0),
    evidenceUpdated: Number(result.evidenceUpdated ?? 0),
    unmatchedAssignments: Number(result.unmatchedAssignments ?? 0),
    logs: Array.isArray(result.logs) ? result.logs.map(String) : [],
  };
}

/** Force full Moodle resync: purge stale data, fetch fresh from sijil-fyp.moodlecloud.com, update DB. */
export async function syncMoodleData(): Promise<MoodleSyncResult> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) {
    throw new Error("Sign in required to sync Moodle data.");
  }

  console.info("[Moodle Sync Started]", { url: MOODLE_SITE_URL });

  const payload = await invokeMoodleFunction({ action: "sync_moodle_data", force: true });
  const result = mapSyncPayload(payload);

  try {
    const repair = await repairMoodleEvidenceRecords();
    console.info("[Moodle Evidence Repair]", repair);
  } catch (repairError) {
    console.warn("[Moodle Evidence Repair] skipped:", repairError);
  }

  console.info("[Moodle Sync Complete]", {
    url: result.moodleSiteUrl ?? MOODLE_SITE_URL,
    userid: result.debug?.userid,
    courses: result.debug?.coursesFetched ?? result.courses,
    assignments: result.debug?.assignmentsFetched ?? result.assignments,
    grades: result.debug?.gradesFetched ?? result.grades,
    feedback: result.debug?.feedbackFetched ?? result.feedback,
    completion: result.debug?.completionFetched ?? result.completion,
    cleanup: result.cleanup,
  });

  return result;
}

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

  const conn = rowToMoodleConnection(data as Record<string, unknown>);
  const repairedSite = await repairStaleMoodleConnectionSiteUrl(userId, conn.moodle_site_url);
  if (repairedSite !== conn.moodle_site_url) {
    return { ...conn, moodle_site_url: repairedSite };
  }
  return conn;
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
    if ("moodle_site_url" in record) updatePayload.moodle_site_url = null;

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
  const currentSite = normalizeMoodleSiteUrl(MOODLE_SITE_URL);

  const { data: courses, error: courseErr } = await supabase
    .from("moodle_courses")
    .select("moodle_course_id,fullname,shortname,raw,synced_at,moodle_site_url")
    .eq("user_id", userId)
    .eq("moodle_site_url", currentSite)
    .order("synced_at", { ascending: false });

  if (courseErr) {
    if (isMissingRelationError(courseErr)) {
      console.warn("moodle_courses table missing — run migration 20260706120000_moodle_sync_tables.sql");
      return [];
    }
    if (isMissingColumnError(courseErr)) {
      // Never show legacy unfiltered Moodle rows — only current-site data after migration + sync.
      console.warn("moodle_site_url column missing — run migration 20260714120000_moodle_site_url_isolation.sql then Refresh Moodle Data");
      return [];
    }
    throw courseErr;
  }

  return buildCourseActivitiesFromRows(userId, courses ?? [], currentSite);
}

function parseCourseMeta(raw: unknown): { completionStatus: string | null; progress: string | null } {
  const record = raw as Record<string, unknown> | null;
  const completionStatus = typeof record?.completion_status === "string"
    ? record.completion_status
    : null;
  const progressRaw = record?.progress;
  const progress = typeof progressRaw === "string"
    ? progressRaw
    : typeof progressRaw === "number"
      ? `${progressRaw}%`
      : null;
  return { completionStatus, progress };
}

function parseDueDate(raw: unknown): string | null {
  const record = raw as Record<string, unknown> | null;
  const assign = record?.assign as Record<string, unknown> | undefined;
  const due = assign?.duedate ?? assign?.cutoffdate ?? assign?.allowsubmissionsfromdate;
  if (due == null) return null;
  const n = Number(due);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString();
}

function isMissingGradeDisplay(value: string | null | undefined): boolean {
  if (!value?.trim()) return true;
  const trimmed = value.trim();
  return trimmed === "—" || trimmed === "-" || trimmed.toLowerCase() === "not graded";
}

function parseNumericGrade(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return String(n);
}

function hydrateAssignmentGrade(row: Record<string, unknown>): {
  grade: string | null;
  gradeMax: string | null;
  gradeFormatted: string | null;
} {
  let grade = parseNumericGrade(row.grade);
  let gradeMax = parseNumericGrade(row.grade_max);
  let gradeFormatted = typeof row.grade_formatted === "string" ? row.grade_formatted : null;

  if (!grade && gradeFormatted && !isMissingGradeDisplay(gradeFormatted)) {
    const match = gradeFormatted.match(/^([\d.]+)\s*(?:\/\s*([\d.]+))?/);
    if (match) {
      grade = match[1];
      if (match[2]) gradeMax = match[2];
    }
  }

  const raw = row.raw as Record<string, unknown> | undefined;
  const report = raw?.gradeReport as Record<string, unknown> | undefined;
  if (report) {
    const reportFormatted = String(
      report.gradeformatted ?? report.gradeFormatted ?? "",
    ).trim();
    if (!grade) {
      grade = parseNumericGrade(report.grade ?? report.graderaw ?? report.finalgrade);
    }
    if (!gradeMax) {
      gradeMax = parseNumericGrade(report.grademax ?? report.gradeMax);
    }
    if (!grade && reportFormatted && !isMissingGradeDisplay(reportFormatted)) {
      const match = reportFormatted.match(/^([\d.]+)\s*(?:\/\s*([\d.]+))?/);
      if (match) {
        grade = match[1];
        if (match[2]) gradeMax = match[2];
      }
    }
    if (isMissingGradeDisplay(gradeFormatted) && reportFormatted && !isMissingGradeDisplay(reportFormatted)) {
      gradeFormatted = reportFormatted;
    }
  }

  const gradeRow = raw?.grade as Record<string, unknown> | undefined;
  if (gradeRow) {
    if (!grade) {
      grade = parseNumericGrade(
        gradeRow.value ?? gradeRow.grade ?? gradeRow.graderaw ?? gradeRow.rawgrade,
      );
    }
    if (!gradeMax) {
      gradeMax = parseNumericGrade(gradeRow.max ?? gradeRow.grademax);
    }
  }

  const lastAttempt = raw?.lastAttempt as Record<string, unknown> | undefined;
  const attemptGrade = lastAttempt?.grade as Record<string, unknown> | undefined;
  if (attemptGrade) {
    if (!grade) {
      grade = parseNumericGrade(
        attemptGrade.value ?? attemptGrade.grade ?? attemptGrade.graderaw,
      );
    }
    if (!gradeMax) {
      gradeMax = parseNumericGrade(attemptGrade.max ?? attemptGrade.grademax);
    }
  }

  if (grade && gradeMax) {
    gradeFormatted = `${grade} / ${gradeMax}`;
  } else if (grade) {
    gradeFormatted = grade;
  }

  return {
    grade,
    gradeMax,
    gradeFormatted: isMissingGradeDisplay(gradeFormatted) ? null : gradeFormatted,
  };
}

async function buildCourseActivitiesFromRows(
  userId: string,
  courses: Record<string, unknown>[],
  currentSite: string | null,
): Promise<MoodleCourseActivity[]> {
  let assignmentQuery = supabase
    .from("moodle_assignments")
    .select(
      "id,moodle_course_id,moodle_assignment_id,name,module_type,submission_status,grade,grade_max,grade_formatted,feedback,graded_at,submitted_at,grade_released,submission_text,submission_files,competency_tags,synced_at,raw",
    )
    .eq("user_id", userId)
    .order("synced_at", { ascending: false });

  if (currentSite) {
    assignmentQuery = assignmentQuery.eq("moodle_site_url", currentSite);
  }

  let { data: assignments, error: assignErr } = await assignmentQuery;

  if (assignErr) {
    if (isMissingRelationError(assignErr)) return [];
    if (isMissingColumnError(assignErr)) {
      let fallbackQuery = supabase
        .from("moodle_assignments")
        .select(
          "id,moodle_course_id,moodle_assignment_id,name,module_type,submission_status,grade,grade_max,grade_formatted,graded_at,submitted_at,grade_released,submission_text,submission_files,competency_tags,synced_at,raw",
        )
        .eq("user_id", userId)
        .order("synced_at", { ascending: false });
      if (currentSite) fallbackQuery = fallbackQuery.eq("moodle_site_url", currentSite);
      const fallback = await fallbackQuery;
      assignments = fallback.data;
      assignErr = fallback.error;
    }
    if (assignErr) throw assignErr;
  }

  let feedbackQuery = supabase
    .from("moodle_feedback")
    .select("moodle_assignment_id,feedback_text")
    .eq("user_id", userId);

  if (currentSite) {
    feedbackQuery = feedbackQuery.eq("moodle_site_url", currentSite);
  }

  const { data: feedbackRows, error: fbErr } = await feedbackQuery;

  if (fbErr && !isMissingRelationError(fbErr)) throw fbErr;

  const feedbackMap = new Map(
    (feedbackRows ?? [])
      .filter((f) => String(f.feedback_text ?? "").trim())
      .map((f) => [Number(f.moodle_assignment_id), f.feedback_text as string]),
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

    const rowFeedback =
      typeof row.feedback === "string" && row.feedback.trim()
        ? row.feedback.trim()
        : null;

    const hydratedGrade = hydrateAssignmentGrade(row);

    list.push({
      id: row.id as string,
      moodleAssignmentId,
      name: row.name as string,
      moduleType: (row.module_type as string) ?? "assign",
      activityType: (row.module_type as string) === "assign" ? "Assignment" : (row.module_type as string),
      submissionStatus: formatSubmissionStatusLabel((row.submission_status as string) ?? "Pending"),
      grade: hydratedGrade.grade,
      gradeMax: hydratedGrade.gradeMax,
      gradeFormatted: hydratedGrade.gradeFormatted,
      feedback: rowFeedback ?? feedbackMap.get(moodleAssignmentId) ?? null,
      submissionText: (row.submission_text as string) ?? null,
      submissionFiles,
      gradedAt: (row.graded_at as string) ?? null,
      submittedAt: (row.submitted_at as string) ?? null,
      dueDate: parseDueDate(row.raw),
      gradeReleased: Boolean(row.grade_released),
      competencyTags,
      importedAt: (row.synced_at as string) ?? new Date().toISOString(),
      source: "LMS",
    });
    assignByCourse.set(courseId, list);
  }

  return courses.map((c) => {
    const courseId = Number(c.moodle_course_id);
    const meta = parseCourseMeta(c.raw);
    return {
      courseId,
      courseName: (c.fullname as string) || (c.shortname as string) || `Course ${c.moodle_course_id}`,
      shortname: (c.shortname as string) ?? null,
      completionStatus: meta.completionStatus,
      progress: meta.progress,
      assignments: assignByCourse.get(courseId) ?? [],
    };
  });
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

export function formatSubmissionStatusLabel(status: string): string {
  const s = status.trim().toLowerCase();
  if (s === "submitted" || s === "graded") return s === "graded" ? "Graded" : "Submitted";
  if (s === "not submitted" || s === "notstarted" || s === "not started") return "Not submitted";
  if (s === "pending" || s === "draft" || s === "new") return "Not submitted";
  if (s === "grade access denied" || s === "permission required") return status;
  return status || "Not submitted";
}

export function formatCompletionStatusLabel(status: string | null | undefined): string {
  if (!status?.trim()) return "In progress";
  const s = status.trim().toLowerCase();
  if (s.includes("complete")) return "Completed";
  if (s.includes("progress")) return "In progress";
  return status;
}

export function activityStatusBadge(status: string): "verified" | "info" | "warning" | "neutral" {
  const s = status.toLowerCase();
  if (s === "graded" || s === "completed") return "verified";
  if (s === "submitted") return "info";
  if (s === "grade access denied" || s === "permission required") return "warning";
  if (s === "not submitted" || s === "pending" || s === "not started" || s === "in progress") return "warning";
  return "neutral";
}

/** Short source label for evidence cards (LMS, GitHub, etc.). */
export function formatEvidenceSourceLabel(source: string | null | undefined): string {
  const normalized = (source ?? "").trim().toLowerCase();
  if (!normalized) return "—";
  if (normalized === "github") return "GitHub";
  if (normalized === "lms" || normalized.includes("moodle")) return "LMS";
  return source!.trim();
}

/** Returns trimmed LMS feedback text, or null when none (UI stays silent). */
export function formatMoodleFeedbackDisplay(feedback: string | null | undefined): string | null {
  const trimmed = feedback?.trim();
  return trimmed || null;
}

export function formatMoodleSyncDebugSummary(result: MoodleSyncResult): string {
  const debug = result.debug;
  if (!debug) {
    return `URL: ${result.moodleSiteUrl ?? MOODLE_SITE_URL}\nCourses: ${result.courses}\nAssignments: ${result.assignments}\nGrades: ${result.grades}\nFeedback: ${result.feedback}\nCompletion: ${result.completion ?? 0}`;
  }
  return [
    debug.sijilEmail ? `SIJIL email: ${debug.sijilEmail}` : null,
    debug.moodleEmail ? `Moodle email: ${debug.moodleEmail}` : null,
    `URL: ${debug.moodleUrl}`,
    `Moodle userid: ${debug.userid}`,
    `Courses: ${debug.coursesFetched}`,
    `Assignments: ${debug.assignmentsFetched}`,
    `Grades: ${debug.gradesFetched}`,
    `Feedback: ${debug.feedbackFetched}`,
    `Completion: ${debug.completionFetched ?? 0}`,
  ].filter(Boolean).join("\n");
}

export function formatGradeDisplay(a: MoodleAssignmentActivity): string {
  const status = a.submissionStatus.toLowerCase();
  if (status === "grade access denied" || status === "permission required") {
    return a.submissionStatus;
  }
  if (a.gradeFormatted && !isMissingGradeDisplay(a.gradeFormatted)) return a.gradeFormatted;
  if (a.grade && a.gradeMax) return `${a.grade} / ${a.gradeMax}`;
  if (a.grade) return a.grade;
  if (status === "graded") return "Grade not synced — refresh Moodle data";
  if (!a.gradeReleased && a.submissionStatus === "Submitted") return "Not graded";
  return "Not graded";
}
