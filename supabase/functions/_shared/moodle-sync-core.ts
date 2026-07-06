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

export type MoodleSyncErrorCode =
  | "INVALID_MOODLE_TOKEN"
  | "MOODLE_API_UNAVAILABLE"
  | "MOODLE_USER_NOT_FOUND"
  | "NO_ENROLLED_COURSES"
  | "NO_ASSIGNMENTS";

export class MoodleSyncError extends Error {
  code: MoodleSyncErrorCode;
  constructor(code: MoodleSyncErrorCode, message: string) {
    super(message);
    this.code = code;
  }
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
      Object.entries(item as Record<string, unknown>).forEach(([childKey, childValue]) => {
        params.append(`${key}[${index}][${childKey}]`, String(childValue));
      });
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

  let res: Response;
  try {
    res = await fetch(`${MOODLE_URL}/webservice/rest/server.php`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });
  } catch {
    throw new MoodleSyncError("MOODLE_API_UNAVAILABLE", "Could not reach the Moodle server.");
  }

  const data = await res.json();

  if (!res.ok || data?.exception || data?.errorcode) {
    const msg = data?.message || data?.debuginfo || "Moodle API request failed";
    if (data?.errorcode === "invalidtoken" || String(msg).toLowerCase().includes("token")) {
      throw new MoodleSyncError("INVALID_MOODLE_TOKEN", msg);
    }
    throw new MoodleSyncError("MOODLE_API_UNAVAILABLE", msg);
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
  const { error } = await admin.from("lms_connections").upsert(row, { onConflict: "user_id" });
  if (!error) return;

  const message = error.message ?? "";
  if (!message.includes("does not exist")) throw error;

  const { error: fallbackErr } = await admin.from("lms_connections").upsert(
    {
      user_id: row.user_id,
      last_synced_at: row.last_synced_at,
      updated_at: row.updated_at,
    },
    { onConflict: "user_id" },
  );
  if (fallbackErr) throw fallbackErr;
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

function tsToIso(ts: unknown): string | null {
  const n = parseNum(ts);
  if (!n || n <= 0) return null;
  return new Date(n * 1000).toISOString();
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
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

async function fetchCourseModuleMap(courseId: number): Promise<Map<number, { modname: string; name: string }>> {
  const map = new Map<number, { modname: string; name: string }>();
  try {
    const contents = await callMoodle("core_course_get_contents", { courseid: courseId });
    for (const section of contents ?? []) {
      for (const mod of section?.modules ?? []) {
        if (mod?.id) {
          map.set(Number(mod.id), {
            modname: mod.modname ?? "module",
            name: mod.name ?? "",
          });
        }
      }
    }
  } catch (err) {
    console.warn(`core_course_get_contents failed for course ${courseId}:`, err);
  }
  return map;
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

async function fetchAssignmentFeedback(
  assignmentId: number,
  moodleUserId: number,
): Promise<{ text: string | null; graderId: number | null; raw: unknown }> {
  try {
    const status = await callMoodle("mod_assign_get_submission_status", {
      assignid: assignmentId,
      userid: moodleUserId,
    });
    const plugins = status?.feedbackplugins ?? status?.plugins ?? [];
    const parts: string[] = [];
    let graderId: number | null = null;

    for (const plugin of plugins) {
      const label = plugin?.name ?? plugin?.type ?? "";
      for (const row of plugin?.fileareas ?? []) {
        for (const f of row?.files ?? []) {
          if (f?.filename) parts.push(`${label}: ${f.filename}`);
        }
      }
      for (const row of plugin?.editorfields ?? []) {
        if (row?.text) parts.push(stripHtml(String(row.text)));
      }
      if (plugin?.grade?.grader) graderId = Number(plugin.grade.grader);
    }

    if (status?.gradefeedback) parts.push(stripHtml(String(status.gradefeedback)));
    if (status?.feedback) parts.push(stripHtml(String(status.feedback)));

    return {
      text: parts.length ? parts.join("\n") : null,
      graderId,
      raw: status,
    };
  } catch {
    return { text: null, graderId: null, raw: null };
  }
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
  const emails = [authEmail, institutionEmail].filter(Boolean) as string[];
  if (!emails.length) {
    throw new MoodleSyncError("MOODLE_USER_NOT_FOUND", "No email available to match your Moodle account.");
  }

  const moodleUser = await findMoodleUserByEmails(emails);
  if (!moodleUser?.id) {
    throw new MoodleSyncError(
      "MOODLE_USER_NOT_FOUND",
      "No Moodle account found for your SIJIL or institution email.",
    );
  }

  const moodleUserId = Number(moodleUser.id);
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

  const enrolled = await callMoodle("core_enrol_get_users_courses", { userid: moodleUserId });
  const courses = (Array.isArray(enrolled) ? enrolled : []).filter(
    (c: { id?: number }) => c?.id && Number(c.id) > 1,
  );

  if (!courses.length) {
    throw new MoodleSyncError("NO_ENROLLED_COURSES", "No enrolled Moodle courses found for your account.");
  }

  let assignmentCount = 0;
  let gradeItemCount = 0;

  for (const course of courses) {
    const courseId = Number(course.id);
    const courseName = course.fullname || course.shortname || `Course ${courseId}`;

    await admin.from("moodle_courses").upsert(
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
      { onConflict: "user_id,moodle_course_id" },
    );

    const moduleMap = await fetchCourseModuleMap(courseId);
    const competencyTags = await fetchCompetencyTags(courseId);

    let assignPayload: { courses?: { id: number; assignments?: Record<string, unknown>[] }[] } = {};
    try {
      assignPayload = await callMoodle("mod_assign_get_assignments", {
        courseids: [courseId],
      });
    } catch (err) {
      warnings.push(`Could not load assignments for ${courseName}`);
      console.warn(err);
    }

    const courseAssignments =
      assignPayload?.courses?.find((c) => Number(c.id) === courseId)?.assignments ?? [];

    const assignmentIds = courseAssignments
      .map((a) => Number(a.id))
      .filter((id) => Number.isFinite(id) && id > 0);

    const submissionsByAssign = new Map<number, Record<string, unknown>>();
    const gradesByAssign = new Map<number, Record<string, unknown>>();

    if (assignmentIds.length) {
      try {
        const subData = await callMoodle("mod_assign_get_submissions", {
          assignmentids: assignmentIds,
        });
        for (const block of subData?.assignments ?? []) {
          const aid = Number(block.assignmentid);
          const mine = (block.submissions ?? []).find(
            (s: { userid?: number }) => Number(s.userid) === moodleUserId,
          );
          if (mine) submissionsByAssign.set(aid, mine);
        }
      } catch {
        warnings.push(`Submission data unavailable for ${courseName}`);
      }

      try {
        const gradeData = await callMoodle("mod_assign_get_grades", {
          assignmentids: assignmentIds,
        });
        for (const block of gradeData?.assignments ?? []) {
          const aid = Number(block.assignmentid);
          const mine = (block.grades ?? []).find(
            (g: { userid?: number }) => Number(g.userid) === moodleUserId,
          );
          if (mine) gradesByAssign.set(aid, mine);
        }
      } catch {
        warnings.push(`Assignment grades unavailable for ${courseName}`);
      }
    }

    for (const assign of courseAssignments) {
      const assignmentId = Number(assign.id);
      const cmid = assign.cmid ? Number(assign.cmid) : null;
      const modInfo = cmid ? moduleMap.get(cmid) : undefined;
      const moduleType = modInfo?.modname ?? "assign";
      const name = String(assign.name ?? modInfo?.name ?? `Assignment ${assignmentId}`);

      const submission = submissionsByAssign.get(assignmentId);
      const gradeRow = gradesByAssign.get(assignmentId);

      const grade = parseNum(gradeRow?.grade);
      const gradeMax = parseNum(assign.grade);
      const gradeReleased = grade !== null || String(submission?.gradingstatus ?? "").toLowerCase() === "graded";
      const submissionStatus = submissionStatusLabel(
        String(submission?.status ?? ""),
        String(submission?.gradingstatus ?? (gradeRow ? "graded" : "")),
        grade,
        gradeReleased,
      );

      const feedback = await fetchAssignmentFeedback(assignmentId, moodleUserId);
      const gradedAt = tsToIso(gradeRow?.timemodified);
      const submittedAt = tsToIso(submission?.timemodified ?? submission?.timecreated);

      if (grade === null && submissionStatus === "Submitted") {
        warnings.push(`Grade not released yet for "${name}" in ${courseName}`);
      }

      await admin.from("moodle_assignments").upsert(
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
          grade_formatted: gradeDisplay(grade, gradeMax),
          graded_at: gradedAt,
          submitted_at: submittedAt,
          grade_released: gradeReleased,
          competency_tags: competencyTags.length ? competencyTags : null,
          raw: { assign, submission, grade: gradeRow },
          synced_at: now,
          updated_at: now,
        },
        { onConflict: "user_id,moodle_assignment_id" },
      );

      await admin.from("moodle_feedback").upsert(
        {
          user_id: userId,
          moodle_assignment_id: assignmentId,
          feedback_text: feedback.text,
          grader_id: feedback.graderId,
          raw: feedback.raw,
          synced_at: now,
          updated_at: now,
        },
        { onConflict: "user_id,moodle_assignment_id" },
      );

      const hash = evidenceHash(userId, courseId, assignmentId);
      const textPreview = [
        `${name} (${moduleType})`,
        gradeDisplay(grade, gradeMax),
        submissionStatus,
        feedback.text,
      ]
        .filter(Boolean)
        .join(" · ")
        .slice(0, 500);

      const { data: lmsRows } = await admin
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
            raw: { courseId, assignmentId, assign, submission, grade: gradeRow, feedback: feedback.text },
            text_preview: textPreview,
            fetched_at: now,
          },
          { onConflict: "user_id,evidence_hash" },
        )
        .select("id");

      const lmsEvidenceId = lmsRows?.[0]?.id ?? null;

      await admin.from("imported_lms_evidence").upsert(
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
          feedback_preview: feedback.text,
          lms_evidence_id: lmsEvidenceId,
          imported_at: now,
          updated_at: now,
        },
        { onConflict: "user_id,moodle_assignment_id" },
      );

      assignmentCount += 1;
    }

    try {
      const gradeReport = await callMoodle("gradereport_user_get_grade_items", {
        userid: moodleUserId,
        courseid: courseId,
      });
      const items = gradeReport?.usergrades?.[0]?.gradeitems ?? [];
      for (const item of items) {
        const itemId = Number(item.id ?? item.itemid);
        if (!itemId || item.itemmodule === "assign") continue;
        const itemGrade = parseNum(item.gradeformatted ?? item.grade);
        const itemMax = parseNum(item.grademax);
        await admin.from("moodle_grades").upsert(
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
          { onConflict: "user_id,moodle_course_id,item_id" },
        );
        gradeItemCount += 1;
      }
    } catch {
      warnings.push(`Grade report unavailable for ${courseName}`);
    }
  }

  if (assignmentCount === 0) {
    warnings.push("No Moodle assignments found in your enrolled courses.");
  }

  return {
    success: true,
    moodleUserId,
    courses: courses.length,
    assignments: assignmentCount,
    grades: gradeItemCount,
    warnings,
  };
}
