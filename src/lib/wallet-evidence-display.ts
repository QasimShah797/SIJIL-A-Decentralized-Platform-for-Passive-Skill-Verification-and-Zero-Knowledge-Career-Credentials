import type { WalletCompetencyRecordView, WalletEvidenceSummary } from "@/lib/wallet-competency-shared";
import { parseEvidenceMetadata } from "@/lib/wallet-evidence-mapping";

export type WalletModalLmsRecord = {
  id: string;
  source: string;
  status: string | null;
  metadata: Record<string, unknown>;
};

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNullableText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    : [];
}

function emptySummary(): WalletEvidenceSummary {
  return {
    competency: { id: "", name: "", domain: "General", description: "" },
    learner: { id: "", did: null },
    github: { repos: [], activities: [], evidenceRecords: [], reviews: [] },
    lms: { evidence: [], courses: [], assignments: [], grades: [], importedEvidence: [] },
    practicalTask: { latestAttempt: null, attemptHistory: [] },
    peerReviews: [],
    teacherFeedback: [],
    institutionReview: { status: null, feedback: null, reviewedAt: null },
    evidenceTimestamps: {
      github: [],
      lms: [],
      practicalTask: [],
      peerReviews: [],
      teacherFeedback: [],
    },
    sourceBadges: [],
    evidenceCount: 0,
  };
}

export function isLmsEvidenceRow(row: Record<string, unknown>): boolean {
  if (!row || typeof row !== "object") return false;
  if (asText(row.source).toUpperCase() === "LMS") return true;

  const externalId = asText(row.external_id);
  if (externalId.startsWith("moodle_assignment_")) return true;

  const metadata = parseEvidenceMetadata(row.metadata);
  if (asText(metadata.platform).toLowerCase() === "moodle") return true;

  return false;
}

export function getAllEvidenceRecords(summary: WalletEvidenceSummary): Record<string, unknown>[] {
  const githubRecords = asArray(summary?.github?.evidenceRecords);
  const lmsRecords = asArray(summary?.lms?.evidence);
  return [...githubRecords, ...lmsRecords];
}

function courseNameForAssignment(
  assignment: Record<string, unknown>,
  summary: WalletEvidenceSummary,
): string | null {
  const metadata = parseEvidenceMetadata(assignment?.metadata);
  const fromMetadata = asNullableText(metadata.course_name);
  if (fromMetadata) return fromMetadata;

  const courseId = asText(assignment.moodle_course_id);
  if (!courseId) return null;

  const courses = asArray(summary?.lms?.courses);
  const course = courses.find((row) => asText(row.moodle_course_id) === courseId);
  return asNullableText(course?.fullname) ?? asNullableText(course?.shortname);
}

function assignmentToLmsRecord(
  assignment: Record<string, unknown>,
  summary: WalletEvidenceSummary,
): WalletModalLmsRecord {
  const metadata = parseEvidenceMetadata(assignment?.metadata);

  return {
    id: asText(assignment.moodle_assignment_id) || asText(assignment.id),
    source: "LMS",
    status: asNullableText(assignment.submission_status) ?? asNullableText(assignment.status),
    metadata: {
      ...metadata,
      course_name: metadata.course_name ?? courseNameForAssignment(assignment, summary),
      assignment_name: metadata.assignment_name ?? assignment.name,
      grade: metadata.grade ?? assignment.grade,
      grade_max: metadata.grade_max ?? assignment.grade_max,
      teacher_feedback: metadata.teacher_feedback ?? assignment.feedback,
    },
  };
}

function evidenceRowToLmsRecord(row: Record<string, unknown>): WalletModalLmsRecord {
  const metadata = parseEvidenceMetadata(row?.metadata);

  return {
    id: asText(row.id) || asText(row.external_id),
    source: asText(row.source) || "LMS",
    status: asNullableText(row.status),
    metadata: {
      ...metadata,
      course_name: metadata.course_name ?? row.course_name ?? row.repository_name,
      assignment_name: metadata.assignment_name ?? row.assignment_name ?? row.description ?? row.text_preview,
      grade: metadata.grade ?? row.grade,
      grade_max: metadata.grade_max ?? row.grade_max,
      teacher_feedback: metadata.teacher_feedback ?? row.feedback ?? row.feedback_text,
    },
  };
}

export function getLmsEvidenceRecords(summary: WalletEvidenceSummary): WalletModalLmsRecord[] {
  const seen = new Set<string>();
  const rows: WalletModalLmsRecord[] = [];

  const push = (row: WalletModalLmsRecord) => {
    const key = row.id || `${asText(row.metadata?.course_name)}:${asText(row.metadata?.assignment_name)}`;
    if (!key.trim() || seen.has(key)) return;
    seen.add(key);
    rows.push(row);
  };

  for (const row of getAllEvidenceRecords(summary)) {
    if (!isLmsEvidenceRow(row)) continue;
    push(evidenceRowToLmsRecord(row));
  }

  for (const row of asArray(summary?.lms?.evidence)) {
    if (isLmsEvidenceRow(row)) continue;
    push(evidenceRowToLmsRecord({ ...row, source: "LMS" }));
  }

  for (const assignment of asArray(summary?.lms?.assignments)) {
    push(assignmentToLmsRecord(assignment, summary));
  }

  for (const row of asArray(summary?.lms?.importedEvidence)) {
    push({
      id: asText(row.id),
      source: "LMS",
      status: asNullableText(row.submission_status),
      metadata: {
        platform: "Moodle",
        course_name: row.course_name,
        assignment_name: row.activity_name,
        grade: row.grade,
        grade_max: row.grade_max,
        teacher_feedback: row.feedback_preview,
      },
    });
  }

  for (const feedback of asArray(summary?.teacherFeedback)) {
    const text = asNullableText(feedback.feedback_text);
    if (!text) continue;
    push({
      id: asText(feedback.evidence_record_id)
        || asText(feedback.moodle_assignment_id)
        || `teacher-${text.slice(0, 24)}`,
      source: "LMS",
      status: asNullableText(feedback.status),
      metadata: {
        platform: "Moodle",
        assignment_name: feedback.source ?? "Teacher feedback",
        teacher_feedback: text,
      },
    });
  }

  return rows;
}

export function getGithubEvidenceRecords(summary: WalletEvidenceSummary): Record<string, unknown>[] {
  return asArray(summary?.github?.evidenceRecords).filter((row) => !isLmsEvidenceRow(row));
}

export function buildModalEvidenceView(record: WalletCompetencyRecordView) {
  const summary = record?.evidencePackage ?? emptySummary();
  const allEvidenceRecords = getAllEvidenceRecords(summary);
  const lmsEvidence = getLmsEvidenceRecords(summary) ?? [];

  return {
    summary,
    allEvidenceRecords,
    lmsEvidence,
    githubEvidenceRecords: getGithubEvidenceRecords(summary),
    sources: allEvidenceRecords.map((row) => asText(row.source) || "unknown"),
  };
}

export function formatLmsGrade(metadata: Record<string, unknown> | null | undefined): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const grade = metadata.grade;
  const gradeMax = metadata.grade_max;
  if (grade != null && gradeMax != null) {
    return `${grade} / ${gradeMax}`;
  }
  if (grade != null) return String(grade);
  return null;
}
