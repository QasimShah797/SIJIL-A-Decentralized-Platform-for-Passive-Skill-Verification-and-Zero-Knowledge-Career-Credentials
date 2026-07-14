/**
 * Maps synced Moodle assignment data into evidence_records + skill_evidence_links.
 * Uses existing evidence_records columns only. Teacher feedback stays in metadata.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

export type DeclaredSkillRef = { id: string; name: string };

export type MoodleEvidenceRepairResult = {
  assignmentsFound: number;
  evidenceCreated: number;
  evidenceUpdated: number;
  skillLinksCreated: number;
  unmatchedAssignments: number;
  logs: string[];
};

function normalizedCompetencyText(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function matchesCompetency(value: unknown, competencyName: string): boolean {
  const left = normalizedCompetencyText(value);
  const right = normalizedCompetencyText(competencyName);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

export function matchesCompetencyTags(tags: unknown, competencyName: string): boolean {
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

export function resolveCompetencyForMoodleAssignment(
  skills: DeclaredSkillRef[],
  params: {
    courseName?: string | null;
    courseShortname?: string | null;
    assignmentName?: string | null;
    competencyTags?: unknown;
  },
): DeclaredSkillRef | null {
  for (const skill of skills) {
    if (
      matchesCompetency(params.courseName, skill.name)
      || matchesCompetency(params.courseShortname, skill.name)
      || matchesCompetency(params.assignmentName, skill.name)
      || matchesCompetencyTags(params.competencyTags, skill.name)
    ) {
      return skill;
    }
  }
  return null;
}

export function moodleAssignmentExternalId(moodleAssignmentId: number | string): string {
  return `moodle_assignment_${moodleAssignmentId}`;
}

function gradePercentage(grade: number | null, gradeMax: number | null): number | null {
  if (grade == null || gradeMax == null || gradeMax <= 0) return null;
  return Math.round((grade / gradeMax) * 100);
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function buildLmsEvidenceMetadata(params: {
  moodleCourseId: number;
  moodleAssignmentId: number;
  courseName: string;
  assignmentName: string;
  grade: number | null;
  gradeMax: number | null;
  teacherFeedback?: string | null;
}): Record<string, unknown> {
  return {
    platform: "Moodle",
    course_name: params.courseName,
    assignment_name: params.assignmentName,
    grade: params.grade,
    grade_max: params.gradeMax,
    grade_percentage: gradePercentage(params.grade, params.gradeMax),
    teacher_feedback: params.teacherFeedback ?? null,
    moodle_course_id: params.moodleCourseId,
    moodle_assignment_id: params.moodleAssignmentId,
  };
}

function logMoodleEvidenceDebug(params: {
  assignmentName: string;
  matchedCompetency: string | null;
  inserted: boolean;
  evidenceId: string | null;
}): void {
  console.log("[moodle-evidence]");
  console.log("[moodle-evidence] assignment found:", params.assignmentName);
  console.log("[moodle-evidence] matched competency:", params.matchedCompetency ?? "—");
  console.log("[moodle-evidence] evidence inserted:", params.inserted ? "YES" : "NO");
  console.log("[moodle-evidence] evidence id:", params.evidenceId ?? "—");
}

export async function upsertMoodleAssignmentEvidenceRecord(
  admin: SupabaseClient,
  params: {
    userId: string;
    skill: DeclaredSkillRef;
    moodleSiteUrl: string;
    moodleCourseId: number;
    moodleAssignmentId: number;
    courseName: string;
    assignmentName: string;
    grade: number | null;
    gradeMax: number | null;
    teacherFeedback?: string | null;
    gradedAt?: string | null;
    submittedAt?: string | null;
    syncedAt?: string;
    requireGrade?: boolean;
  },
): Promise<{ evidenceRecordId: string | null; created: boolean; updated: boolean }> {
  if (params.requireGrade && params.grade == null) {
    return { evidenceRecordId: null, created: false, updated: false };
  }

  const now = params.syncedAt ?? new Date().toISOString();
  const externalId = moodleAssignmentExternalId(params.moodleAssignmentId);
  const metadata = buildLmsEvidenceMetadata(params);
  const status = params.grade != null ? "verified" : "pending";

  const { data: existing } = await admin
    .from("evidence_records")
    .select("id")
    .eq("user_id", params.userId)
    .eq("external_id", externalId)
    .eq("source", "LMS")
    .maybeSingle();

  const payload = {
    user_id: params.userId,
    source: "LMS",
    external_id: externalId,
    status,
    repository_name: params.assignmentName,
    repository_url: params.moodleSiteUrl,
    description: params.assignmentName,
    language: null,
    stars: 0,
    forks: 0,
    last_updated: params.gradedAt ?? params.submittedAt ?? now,
    commit_count: null,
    pr_summary: null,
    sync_date: now,
    suggested_skill_id: null,
    suggested_skill_name: params.skill.name,
    mapped_skill_id: params.skill.id,
    github_repo_id: null,
    metadata,
  };

  const { data: upserted, error } = await admin
    .from("evidence_records")
    .upsert(payload, { onConflict: "user_id,external_id" })
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[moodle-evidence] evidence_records upsert failed:", error.message, {
      externalId,
      assignmentId: params.moodleAssignmentId,
      skillId: params.skill.id,
    });
    logMoodleEvidenceDebug({
      assignmentName: params.assignmentName,
      matchedCompetency: params.skill.name,
      inserted: false,
      evidenceId: null,
    });
    return { evidenceRecordId: null, created: false, updated: false };
  }

  const evidenceRecordId = upserted?.id ? String(upserted.id) : existing?.id ? String(existing.id) : null;
  const created = !existing?.id && Boolean(evidenceRecordId);
  const updated = Boolean(existing?.id && evidenceRecordId);

  if (evidenceRecordId) {
    const { error: linkError } = await admin
      .from("skill_evidence_links")
      .upsert(
        {
          user_id: params.userId,
          skill_id: params.skill.id,
          evidence_record_id: evidenceRecordId,
          linked_at: now,
        },
        { onConflict: "skill_id,evidence_record_id" },
      );

    if (linkError) {
      console.warn("[moodle-evidence] skill_evidence_links upsert failed:", linkError.message);
    }
  }

  logMoodleEvidenceDebug({
    assignmentName: params.assignmentName,
    matchedCompetency: params.skill.name,
    inserted: created,
    evidenceId: evidenceRecordId,
  });

  return { evidenceRecordId, created, updated };
}

export async function repairMoodleEvidenceRecords(
  admin: SupabaseClient,
  userId: string,
): Promise<MoodleEvidenceRepairResult> {
  const logs: string[] = [];
  let evidenceCreated = 0;
  let evidenceUpdated = 0;
  let skillLinksCreated = 0;
  let unmatchedAssignments = 0;

  const [{ data: skillsRows }, { data: courseRows }, { data: assignmentRows }, { data: feedbackRows }] =
    await Promise.all([
      admin.from("declared_skills").select("id, name").eq("user_id", userId),
      admin.from("moodle_courses").select("moodle_course_id, fullname, shortname, moodle_site_url").eq("user_id", userId),
      admin.from("moodle_assignments").select(
        "moodle_course_id, moodle_assignment_id, name, grade, grade_max, competency_tags, feedback, moodle_site_url, synced_at",
      ).eq("user_id", userId),
      admin.from("moodle_feedback").select("moodle_assignment_id, feedback_text").eq("user_id", userId),
    ]);

  const skills = (skillsRows ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name ?? ""),
  }));

  const coursesById = new Map<number, { fullname: string; shortname: string | null; moodle_site_url: string | null }>();
  for (const row of courseRows ?? []) {
    coursesById.set(Number(row.moodle_course_id), {
      fullname: String(row.fullname ?? ""),
      shortname: row.shortname ? String(row.shortname) : null,
      moodle_site_url: row.moodle_site_url ? String(row.moodle_site_url) : null,
    });
  }

  const feedbackByAssignment = new Map<number, string>();
  for (const row of feedbackRows ?? []) {
    const assignmentId = Number(row.moodle_assignment_id);
    const text = asText(row.feedback_text);
    if (assignmentId && text) feedbackByAssignment.set(assignmentId, text);
  }

  const assignments = assignmentRows ?? [];
  console.log("[moodle-evidence] Moodle assignments found:", assignments.length);

  for (const row of assignments) {
    const assignmentId = Number(row.moodle_assignment_id);
    const courseId = Number(row.moodle_course_id);
    const course = coursesById.get(courseId);
    const courseName = course?.fullname ?? `Course ${courseId}`;
    const courseShortname = course?.shortname ?? null;
    const moodleSiteUrl = asText(row.moodle_site_url) || asText(course?.moodle_site_url) || "https://sijil-fyp.moodlecloud.com";
    const assignmentName = asText(row.name) || `Assignment ${assignmentId}`;
    const teacherFeedback = asText(row.feedback) || feedbackByAssignment.get(assignmentId) || null;
    const grade = asNumber(row.grade);
    const gradeMax = asNumber(row.grade_max);

    console.log("[moodle-evidence]");
    console.log("[moodle-evidence] assignment found:", assignmentName);

    const matched = resolveCompetencyForMoodleAssignment(skills, {
      courseName,
      courseShortname,
      assignmentName,
      competencyTags: row.competency_tags,
    });

    if (!matched) {
      unmatchedAssignments += 1;
      console.log("[moodle-evidence] matched competency: —");
      console.log("[moodle-evidence] evidence inserted: NO");
      console.log("[moodle-evidence] evidence id: —");
      logs.push(`No competency match for assignment "${assignmentName}" (${assignmentId})`);
      continue;
    }

    const result = await upsertMoodleAssignmentEvidenceRecord(admin, {
      userId,
      skill: matched,
      moodleSiteUrl,
      moodleCourseId: courseId,
      moodleAssignmentId: assignmentId,
      courseName,
      assignmentName,
      grade,
      gradeMax,
      teacherFeedback,
      syncedAt: asText(row.synced_at) || new Date().toISOString(),
      requireGrade: false,
    });

    if (result.created) evidenceCreated += 1;
    if (result.updated) evidenceUpdated += 1;
    if (result.evidenceRecordId) skillLinksCreated += 1;

    logs.push(
      `Assignment "${assignmentName}" → competency "${matched.name}" · evidence ${result.evidenceRecordId ?? "—"}`,
    );
  }

  return {
    assignmentsFound: assignments.length,
    evidenceCreated,
    evidenceUpdated,
    skillLinksCreated,
    unmatchedAssignments,
    logs,
  };
}

/** @deprecated Use repairMoodleEvidenceRecords */
export const repairMoodleEvidenceMapping = repairMoodleEvidenceRecords;
