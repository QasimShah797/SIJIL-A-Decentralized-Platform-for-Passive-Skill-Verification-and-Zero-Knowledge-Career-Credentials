import { supabase } from "@/integrations/supabase/client";
import { MOODLE_SITE_URL, normalizeMoodleSiteUrl } from "@/lib/moodle-integration";
import type { DeclaredSkill } from "@/lib/sijil-data";
import { rowToReview } from "@/lib/db/peer-reviews";
import {
  attemptTaskLabel,
  isAttemptSubmitted,
  resolveAttempt,
} from "@/lib/db/practical-attempts";
import { fetchCredentials } from "@/lib/db/credentials";
import { institutionDisplayName } from "@/lib/institution-routing";
import {
  lmsEvidenceMatchesSkill,
  matchesCompetency,
  moodleAssignmentMatchesSkill,
  type MoodleTrailEvidence,
} from "@/lib/moodle-evidence-matching";
import {
  evidenceLabelForAttempt,
  evidenceLabelForStage,
  nextStepForAttempt,
  nextStepForStage,
  pipelineStageLabel,
  resolveEffectivePipelineStage,
} from "@/lib/competency-pipeline";

export type ValidationSummary = {
  skillId: string;
  skill: string;
  pipelineStage: string;
  currentStageLabel: string;
  evidence: string;
  institution: string;
  nextStep: string;
  result: string;
  status: string;
  evaluatedOn: string;
  sources: string[];
  reviewCount: number;
  supportingRecords: number;
  latestActivity: string;
  task: string;
  rows: { name: string; type: string; date: string; role: string }[];
  evidencePackageSent: boolean;
  institutionFeedback?: string;
};

function formatDate(value: unknown): string {
  if (!value) return "—";
  const raw = String(value).trim();
  if (!raw) return "—";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString();
}

async function fetchMoodleEvidenceForSkill(
  userId: string,
  skill: DeclaredSkill,
): Promise<MoodleTrailEvidence[]> {
  const currentSite = normalizeMoodleSiteUrl(MOODLE_SITE_URL);

  const siteFilter = (query: ReturnType<typeof supabase.from>) =>
    query.eq("moodle_site_url", currentSite);

  const [lmsAll, assignments, courses, feedback] = await Promise.all([
    safeQuery(
      () => siteFilter(
        supabase
          .from("lms_evidence")
          .select("*")
          .eq("user_id", userId),
      ).order("fetched_at", { ascending: false }),
      { data: [], error: null },
    ),
    safeQuery(
      () => siteFilter(
        supabase
          .from("moodle_assignments")
          .select("*")
          .eq("user_id", userId),
      ).order("synced_at", { ascending: false }),
      { data: [], error: null },
    ),
    safeQuery(
      () => siteFilter(
        supabase
          .from("moodle_courses")
          .select("moodle_course_id, fullname, shortname")
          .eq("user_id", userId),
      ),
      { data: [], error: null },
    ),
    safeQuery(
      () => siteFilter(
        supabase
          .from("moodle_feedback")
          .select("moodle_assignment_id, feedback_text")
          .eq("user_id", userId),
      ),
      { data: [], error: null },
    ),
  ]);

  const courseNameById = new Map<number, string>();
  for (const row of courses.data ?? []) {
    const courseId = Number(row.moodle_course_id);
    if (!courseId) continue;
    courseNameById.set(
      courseId,
      String(row.fullname ?? row.shortname ?? `Course ${courseId}`),
    );
  }

  const feedbackByAssignment = new Map<number, string>();
  for (const row of feedback.data ?? []) {
    const assignmentId = Number(row.moodle_assignment_id);
    const text = String(row.feedback_text ?? "").trim();
    if (assignmentId && text) feedbackByAssignment.set(assignmentId, text);
  }

  const seen = new Set<string>();
  const items: MoodleTrailEvidence[] = [];

  const pushItem = (item: MoodleTrailEvidence) => {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    items.push(item);
  };

  for (const row of lmsAll.data ?? []) {
    const record = row as Record<string, unknown>;
    if (!lmsEvidenceMatchesSkill(record, skill.id, skill.name)) continue;
    pushItem({
      id: `lms:${String(record.id)}`,
      name: String(record.text_preview ?? record.course_name ?? "LMS evidence"),
      courseName: String(record.course_name ?? "Moodle course"),
      grade: record.grade != null ? String(record.grade) : null,
      feedback: null,
      status: record.completion_status != null ? String(record.completion_status) : null,
      date: record.fetched_at != null ? String(record.fetched_at) : null,
    });
  }

  for (const row of assignments.data ?? []) {
    const record = row as Record<string, unknown>;
    const courseId = Number(record.moodle_course_id);
    const courseName = courseNameById.get(courseId) ?? String(record.course_name ?? "");
    const matchesSkill = moodleAssignmentMatchesSkill(record, skill.name)
      || matchesCompetency(courseName, skill.name);
    if (!matchesSkill) continue;
    const assignmentId = Number(record.moodle_assignment_id);
    pushItem({
      id: `assignment:${String(record.id ?? assignmentId)}`,
      name: String(record.name ?? "Moodle assignment"),
      courseName: courseName || "Moodle course",
      grade: record.grade_formatted != null
        ? String(record.grade_formatted)
        : record.grade != null
          ? String(record.grade)
          : null,
      feedback: feedbackByAssignment.get(assignmentId) ?? null,
      status: record.submission_status != null ? String(record.submission_status) : null,
      date: String(record.graded_at ?? record.submitted_at ?? record.synced_at ?? ""),
    });
  }

  return items;
}

function reviewMatchesSkill(
  row: Record<string, unknown>,
  skillId: string,
  skillName: string,
): boolean {
  const rowSkillId = row.skill_id as string | null | undefined;
  if (rowSkillId) return rowSkillId === skillId;
  return String(row.skill ?? row.competency_name ?? "")
    .trim()
    .toLowerCase() === skillName.trim().toLowerCase();
}

async function fetchPeerReviewsForSkill(
  userId: string,
  skillId: string,
  skillName: string,
) {
  const [{ data: bySkillId, error: byIdError }, { data: legacyByName, error: byNameError }] = await Promise.all([
    supabase
      .from("peer_reviews")
      .select("*")
      .eq("learner_user_id", userId)
      .eq("skill_id", skillId)
      .order("created_at", { ascending: false }),
    supabase
      .from("peer_reviews")
      .select("*")
      .eq("learner_user_id", userId)
      .is("skill_id", null)
      .eq("skill", skillName)
      .order("created_at", { ascending: false }),
  ]);

  if (byIdError && byNameError) return [];

  const seen = new Set<string>();
  return [...(bySkillId ?? []), ...(legacyByName ?? [])]
    .filter((row) => {
      const id = row.id as string;
      if (seen.has(id)) return false;
      seen.add(id);
      return reviewMatchesSkill(row as Record<string, unknown>, skillId, skillName);
    })
    .map((row) => rowToReview(row as Record<string, unknown>));
}

function pushEvidenceRow(
  rows: ValidationSummary["rows"],
  params: { name: string; type: string; date: string; role: string },
) {
  rows.push(params);
}

async function safeQuery<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.warn("Validation trail query failed:", error);
    return fallback;
  }
}

export function createFallbackValidationSummary(skill: DeclaredSkill): ValidationSummary {
  const stage = skill.pipelineStage ?? "declared";
  return {
    skillId: skill.id,
    skill: skill.name,
    pipelineStage: stage,
    currentStageLabel: pipelineStageLabel(stage),
    evidence: evidenceLabelForStage(stage),
    institution: "—",
    nextStep: nextStepForStage(stage),
    result: "Pending",
    status: pipelineStageLabel(stage),
    evaluatedOn: "—",
    sources: ["No evidence yet"],
    reviewCount: 0,
    supportingRecords: 0,
    latestActivity: "—",
    task: "—",
    rows: [],
    evidencePackageSent: false,
  };
}

export async function buildValidationSummary(
  userId: string,
  skill: DeclaredSkill,
): Promise<ValidationSummary> {
  const [
    ghActs,
    moodleEvidence,
    ghRepos,
    supportingRecords,
    evidenceLinks,
    skillReviews,
    attempt,
    credentials,
  ] = await Promise.all([
    supabase
      .from("github_activities")
      .select("*")
      .eq("user_id", userId)
      .eq("linked_skill_id", skill.id)
      .order("occurred_at", { ascending: false })
      .limit(20),
    safeQuery(() => fetchMoodleEvidenceForSkill(userId, skill), []),
    supabase
      .from("github_repos")
      .select("*")
      .eq("user_id", userId)
      .eq("linked_skill_id", skill.id)
      .limit(10),
    supabase
      .from("supporting_records")
      .select("*")
      .eq("user_id", userId)
      .eq("skill_id", skill.id)
      .order("occurred_at", { ascending: false }),
    safeQuery(
      () => supabase
        .from("skill_evidence_links")
        .select("match_reason, evidence_records(*)")
        .eq("user_id", userId)
        .eq("skill_id", skill.id),
      { data: [], error: null },
    ),
    safeQuery(
      () => fetchPeerReviewsForSkill(userId, skill.id, skill.name),
      [],
    ),
    safeQuery(() => resolveAttempt(userId, skill.id), null),
    safeQuery(() => fetchCredentials(userId), []),
  ]);

  const rows: ValidationSummary["rows"] = [];
  const inWallet = credentials.some(
    (c) => c.skill.trim().toLowerCase() === skill.name.trim().toLowerCase(),
  );

  for (const e of moodleEvidence) {
    const detail = [
      e.grade ? `Grade: ${e.grade}` : null,
      e.feedback ? `Feedback: ${e.feedback}` : null,
      e.status ? `Status: ${e.status}` : null,
    ].filter(Boolean).join(" · ");
    pushEvidenceRow(rows, {
      name: e.courseName !== e.name ? `${e.courseName} — ${e.name}` : e.name,
      type: "LMS",
      date: formatDate(e.date),
      role: detail || "Moodle evidence",
    });
  }
  for (const a of ghActs.data ?? []) {
    pushEvidenceRow(rows, {
      name: String(a.activity_title ?? "GitHub activity"),
      type: "GitHub",
      date: formatDate(a.occurred_at),
      role: "Code contribution",
    });
  }
  for (const r of ghRepos.data ?? []) {
    pushEvidenceRow(rows, {
      name: String(r.repo_name ?? r.full_name ?? "Repository"),
      type: "GitHub",
      date: formatDate(r.last_updated),
      role: "Repository",
    });
  }
  for (const record of supportingRecords.data ?? []) {
    pushEvidenceRow(rows, {
      name: String(record.title ?? "Uploaded evidence"),
      type: "Upload",
      date: formatDate(record.occurred_at ?? record.created_at),
      role: "Supporting record",
    });
  }
  for (const link of evidenceLinks.data ?? []) {
    const raw = link.evidence_records;
    const evidence = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | null;
    if (!evidence) continue;
    pushEvidenceRow(rows, {
      name: String(evidence.repository_name ?? evidence.title ?? "Linked evidence"),
      type: String(evidence.source ?? "Evidence"),
      date: formatDate(evidence.last_updated ?? evidence.created_at),
      role: String(link.match_reason ?? "Mapped evidence"),
    });
  }
  if (attempt) {
    pushEvidenceRow(rows, {
      name: `Practical attempt ${attempt.attemptId}`,
      type: "Practical Submission",
      date: formatDate(attempt.startedAt),
      role: attempt.passed || attempt.status === "passed"
        ? "Passed practical task"
        : attempt.status === "submitted" || attempt.status === "auto_submitted"
          ? "Submitted — awaiting evaluation"
          : attempt.status === "in_progress"
            ? "In progress"
            : "Hands-on artifact",
    });
  }
  for (const r of skillReviews) {
    pushEvidenceRow(rows, {
      name: `${r.reviewerName} — ${r.reviewerRole}`,
      type: "Review",
      date: formatDate(r.date),
      role: "Peer review",
    });
  }

  const sources = [...new Set(rows.map((r) => r.type))];
  const supportingRecordCount = rows.length;
  const hasEvidence = supportingRecordCount > 0 || skill.status === "Evidence Linked";

  const dates = rows
    .map((r) => r.date)
    .filter((d) => d !== "—")
    .sort()
    .reverse();

  const pipelineStage = resolveEffectivePipelineStage(skill, {
    hasEvidence,
    attemptPassed: attempt?.passed === true || attempt?.status === "passed",
    attemptInProgress: !!attempt && ["in_progress", "submitted", "auto_submitted"].includes(attempt.status),
    inWallet,
    peerReviewCount: skillReviews.length,
  });

  const currentStageLabel = pipelineStageLabel(pipelineStage);
  const attemptSubmitted = isAttemptSubmitted(attempt);

  return {
    skillId: skill.id,
    skill: skill.name,
    pipelineStage,
    currentStageLabel,
    evidence: evidenceLabelForAttempt(pipelineStage, attempt),
    institution: "—",
    nextStep: nextStepForAttempt(pipelineStage, attempt),
    result: attemptSubmitted || attempt?.passed ? "In progress" : "Pending",
    status: currentStageLabel,
    evaluatedOn: dates[0] ?? "—",
    sources: sources.length ? sources : ["No evidence yet"],
    reviewCount: skillReviews.length,
    supportingRecords: supportingRecordCount,
    latestActivity: dates[0] ?? "—",
    task: attemptTaskLabel(attempt),
    rows,
    evidencePackageSent: false,
  };
}

/** Build a read-only validation trail from a stored attestation request snapshot. */
export function buildValidationSummaryFromAttestation(
  request: import("@/lib/db/institution-attestation-requests").InstitutionAttestationRequest,
): ValidationSummary {
  const rows: ValidationSummary["rows"] = [];

  for (const item of request.moodleEvidence ?? []) {
    pushEvidenceRow(rows, {
      name: String(item.course_name ?? item.text_preview ?? "LMS evidence"),
      type: "LMS",
      date: formatDate(item.fetched_at ?? item.imported_at),
      role: "Primary evidence",
    });
  }
  for (const item of request.githubEvidence ?? []) {
    const isRepo = item.repo_name != null || item.full_name != null;
    pushEvidenceRow(rows, {
      name: String(item.activity_title ?? item.repo_name ?? item.full_name ?? "GitHub evidence"),
      type: "GitHub",
      date: formatDate(item.occurred_at ?? item.last_updated ?? item.synced_at),
      role: isRepo ? "Repository" : "Code contribution",
    });
  }
  for (const item of request.certificateEvidence ?? []) {
    pushEvidenceRow(rows, {
      name: String(item.title ?? "Certificate"),
      type: "Upload",
      date: formatDate(item.occurred_at ?? item.created_at),
      role: "Supporting record",
    });
  }
  for (const item of request.peerReviewEvidence ?? []) {
    pushEvidenceRow(rows, {
      name: `${String(item.reviewerName ?? "Reviewer")} — ${String(item.reviewerRole ?? "Peer")}`,
      type: "Review",
      date: formatDate(item.date),
      role: "Peer review",
    });
  }
  if (request.practicalTaskResult?.attemptId) {
    pushEvidenceRow(rows, {
      name: `Practical attempt ${request.practicalTaskResult.attemptId}`,
      type: "Practical Submission",
      date: formatDate(request.practicalTaskResult.submittedAt),
      role: request.practicalTaskResult.status === "Passed"
        ? "Passed practical task"
        : "Practical task submission",
    });
  }

  const dates = rows
    .map((r) => r.date)
    .filter((d) => d !== "—")
    .sort()
    .reverse();
  const sources = [...new Set(rows.map((r) => r.type))];
  const pipelineStage = request.currentStage || request.status;

  return {
    skillId: request.skillId,
    skill: request.competencyName,
    pipelineStage,
    currentStageLabel: pipelineStageLabel(pipelineStage),
    evidence: request.practicalTaskResult?.status === "Passed"
      ? "Practical Task Passed"
      : "Evidence snapshot",
    institution: institutionDisplayName(request.institutionName),
    nextStep: "Read-only attestation snapshot",
    result: request.status === "approved" ? "Approved" : request.status === "rejected" ? "Rejected" : "Pending",
    status: pipelineStageLabel(pipelineStage),
    evaluatedOn: dates[0] ?? "—",
    sources: sources.length ? sources : ["No evidence yet"],
    reviewCount: request.peerReviewEvidence?.length ?? 0,
    supportingRecords: rows.length,
    latestActivity: dates[0] ?? "—",
    task: request.practicalTaskResult?.title ?? "Practical task",
    rows,
    evidencePackageSent: request.status === "pending",
    institutionFeedback: request.institutionFeedback,
  };
}

export async function buildAllValidationSummaries(
  userId: string,
  skills: DeclaredSkill[],
): Promise<ValidationSummary[]> {
  const summaries = await Promise.all(
    skills.map(async (skill) => {
      try {
        return await buildValidationSummary(userId, skill);
      } catch (error) {
        console.error("Validation summary failed for skill", skill.id, error);
        return createFallbackValidationSummary(skill);
      }
    }),
  );
  return summaries;
}
