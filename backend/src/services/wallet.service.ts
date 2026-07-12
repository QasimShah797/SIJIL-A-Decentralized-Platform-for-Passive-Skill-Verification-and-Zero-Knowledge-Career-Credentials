import { randomUUID } from "node:crypto";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";
import { generateSha256Hash } from "../utils/generateHash";
import {
  buildSelectiveDisclosureProof,
  hashDisclosurePayload,
  verifySelectiveDisclosureProof,
} from "./proof.service";
import { supabaseService } from "./supabase.service";
import type {
  PublicPresentationVerification,
  PublicPresentationView,
  ShareWalletCompetencyInput,
  ShareWalletCompetencyResult,
  WalletAttemptHistoryItem,
  WalletCompetencyDetailView,
  WalletCompetencyRecordView,
  WalletEvidenceSummary,
  WalletPracticalTaskStatus,
  WalletRecordStatus,
  WalletShareFieldId,
  WalletShareRecordView,
  WalletSourceBadge,
} from "../types/wallet.types";

type DbRow = Record<string, unknown>;

type PersistedWalletRow = {
  id: string;
  learner_id: string;
  competency_id: string;
  competency_name: string;
  status: string;
  practical_task_status: string | null;
  evidence_summary: unknown;
  created_at: string;
  updated_at: string;
};

type PresentationRow = {
  id: string;
  learner_id: string;
  competency_id: string;
  selected_fields: WalletShareFieldId[];
  selection_mode: string;
  disclosed_payload: Record<string, unknown>;
  payload_hash: string;
  proof_type: string;
  proof_value: string | null;
  verification_method: string | null;
  share_token_hash: string;
  share_token_hint: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
};

const DISCLOSURE_REDACT_KEYS = new Set([
  "id",
  "user_id",
  "learner_user_id",
  "learner_id",
  "candidate_user_id",
  "credential_id",
  "skill_id",
  "linked_skill_id",
  "mapped_skill_id",
  "suggested_skill_id",
  "lms_evidence_id",
  "share_token_hash",
  "share_token_hint",
  "proof_value",
  "answer_key",
  "token",
]);

function db() {
  return supabaseService.client as unknown as {
    from: (table: string) => {
      select: (columns?: string) => any;
      upsert: (payload: unknown, options?: unknown) => any;
      insert: (payload: unknown) => any;
      update: (payload: unknown) => any;
    };
  };
}

function asRecord(value: unknown): DbRow | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as DbRow)
    : null;
}

function asRows(value: unknown): DbRow[] {
  return Array.isArray(value)
    ? value.filter((item): item is DbRow => !!item && typeof item === "object")
    : [];
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNullableText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizedText(value: unknown): string {
  return asText(value).trim().toLowerCase();
}

function competencyMatches(left: unknown, right: string): boolean {
  const a = normalizedText(left);
  const b = normalizedText(right);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function uniqueStrings(list: Array<string | null | undefined>): string[] {
  return [...new Set(list.filter((item): item is string => Boolean(item)))];
}

function sortStringsByLatest(list: Array<string | null | undefined>): string[] {
  return uniqueStrings(list).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
}

function sortByLatest<T extends DbRow>(rows: T[], fields: string[]): T[] {
  const getTime = (row: T) => {
    for (const field of fields) {
      const value = row[field];
      if (typeof value === "string" && value) {
        const time = new Date(value).getTime();
        if (Number.isFinite(time)) return time;
      }
    }
    return 0;
  };

  return [...rows].sort((a, b) => getTime(b) - getTime(a));
}

function dedupeByKey<T>(items: T[], getKey: (item: T) => string): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const item of items) {
    const key = getKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

function hasItems(list: DbRow[]): boolean {
  return list.length > 0;
}

function deriveWalletPracticalTaskStatus(params: {
  passed?: boolean | null;
  scorePercent?: number | null;
  status?: string | null;
}): WalletPracticalTaskStatus {
  if (params.status === "timed_out" || params.status === "auto_submitted") return "Timed Out";
  if (params.passed) return "Passed";
  if (params.scorePercent != null) return "Needs Improvement";
  return "Submitted";
}

function deriveWalletRecordStatus(params: {
  githubCount: number;
  lmsCount: number;
  practicalTaskStatus: WalletPracticalTaskStatus | null;
  reviewCount: number;
}): WalletRecordStatus {
  if (params.reviewCount > 0) return "Review Available";
  if (params.practicalTaskStatus === "Passed") return "Passed";
  if (params.practicalTaskStatus === "Needs Improvement") return "Needs Improvement";
  if (params.practicalTaskStatus === "Timed Out") return "Timed Out";
  if (params.practicalTaskStatus === "Submitted") return "Submitted";
  if (params.githubCount > 0 || params.lmsCount > 0) return "Evidence Collected";
  return "Evidence Collected";
}

function deriveWalletSourceBadges(params: {
  github: DbRow[];
  lms: DbRow[];
  practicalTasks: WalletAttemptHistoryItem[];
  reviews: DbRow[];
}): WalletSourceBadge[] {
  const badges: WalletSourceBadge[] = [];
  if (hasItems(params.github)) badges.push("GitHub");
  if (hasItems(params.lms)) badges.push("LMS");
  if (params.practicalTasks.length > 0) badges.push("Practical Task");
  if (hasItems(params.reviews)) badges.push("Reviews");
  return badges;
}

function countWalletEvidence(summary: Pick<
  WalletEvidenceSummary,
  "github" | "lms" | "practicalTask" | "peerReviews" | "teacherFeedback" | "externalEvidence"
>): number {
  return (
    summary.github.repos.length
    + summary.github.activities.length
    + summary.github.evidenceRecords.length
    + summary.github.reviews.length
    + summary.lms.evidence.length
    + summary.lms.courses.length
    + summary.lms.assignments.length
    + summary.lms.grades.length
    + summary.lms.importedEvidence.length
    + summary.practicalTask.attemptHistory.length
    + summary.peerReviews.length
    + summary.teacherFeedback.length
    + summary.externalEvidence.length
  );
}

function extractEvidenceHashes(summary: WalletEvidenceSummary): string[] {
  const hashes: Array<string | null> = [];
  for (const item of summary.lms.evidence) {
    hashes.push(asNullableText(item.evidence_hash));
  }
  for (const item of summary.github.evidenceRecords) {
    hashes.push(asNullableText(item.external_id));
  }
  for (const item of summary.peerReviews) {
    hashes.push(asNullableText(item.external_reference));
  }
  for (const item of summary.externalEvidence) {
    hashes.push(asNullableText(item.url));
  }
  return uniqueStrings(hashes);
}

function sanitizeForDisclosure(value: unknown): unknown {
  if (value == null) return value;
  if (Array.isArray(value)) {
    const next = value
      .map((item) => sanitizeForDisclosure(item))
      .filter((item) => item !== null && item !== undefined);
    return next.length > 0 ? next : undefined;
  }
  if (typeof value !== "object") return value;

  const record = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(record)) {
    if (DISCLOSURE_REDACT_KEYS.has(key)) continue;
    const sanitized = sanitizeForDisclosure(nested);
    if (sanitized === undefined) continue;
    if (typeof sanitized === "string" && !sanitized.trim()) continue;
    if (Array.isArray(sanitized) && sanitized.length === 0) continue;
    if (
      sanitized
      && typeof sanitized === "object"
      && !Array.isArray(sanitized)
      && Object.keys(sanitized as Record<string, unknown>).length === 0
    ) {
      continue;
    }
    next[key] = sanitized;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

function parseJsonLikeArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function computeMcqEvaluation(row: DbRow): {
  scorePercent: number | null;
  correctCount: number | null;
  totalQuestions: number | null;
} {
  const correctCountFromRow = asNumber(row.correct_count);
  const totalQuestionsFromRow = asNumber(row.total_questions);
  const percentageFromRow = asNumber(row.percentage);
  if (
    correctCountFromRow != null
    || totalQuestionsFromRow != null
    || percentageFromRow != null
  ) {
    return {
      scorePercent: percentageFromRow,
      correctCount: correctCountFromRow,
      totalQuestions: totalQuestionsFromRow,
    };
  }

  const answerKey = parseJsonLikeArray(row.answer_key);
  const learnerAnswers = parseJsonLikeArray(row.learner_answers);
  const totalQuestions = answerKey.length || parseJsonLikeArray(row.questions).length || null;
  if (!answerKey.length || !learnerAnswers.length || totalQuestions == null || totalQuestions === 0) {
    return { scorePercent: null, correctCount: null, totalQuestions };
  }

  let correctCount = 0;
  for (let index = 0; index < answerKey.length; index += 1) {
    if (answerKey[index] === learnerAnswers[index]) correctCount += 1;
  }

  const scorePercent = Math.round((correctCount / answerKey.length) * 100);
  return {
    scorePercent,
    correctCount,
    totalQuestions: answerKey.length,
  };
}

function parseSubmissionSession(submission: unknown): DbRow | null {
  if (typeof submission !== "string" || !submission.trim()) return null;
  try {
    return asRecord(JSON.parse(submission));
  } catch {
    return null;
  }
}

function buildAttemptHistoryItem(row: DbRow): WalletAttemptHistoryItem | null {
  const attemptId = asText(row.id ?? row.attempt_id) || randomUUID();
  const title = asText(row.title) || "Practical task";
  const evaluation = computeMcqEvaluation(row);
  const scorePercent = asNumber(row.score ?? row.resultPercentage) ?? evaluation.scorePercent;
  const correctCount = asNumber(row.resultCorrectCount) ?? evaluation.correctCount;
  const totalQuestions = asNumber(row.resultTotalQuestions) ?? evaluation.totalQuestions;
  const passed = row.passed === true || (scorePercent != null && scorePercent >= 70);
  const submittedAt = asNullableText(row.submitted_at ?? row.updated_at ?? row.created_at);

  if (!title && !submittedAt && scorePercent == null && !attemptId) {
    return null;
  }

  return {
    attemptId,
    title,
    status: deriveWalletPracticalTaskStatus({ passed, scorePercent, status: asNullableText(row.status) }),
    submittedAt,
    scorePercent,
    correctCount,
    totalQuestions,
    passed,
  };
}

async function safeFetchRows(
  table: string,
  run: () => Promise<{ data: unknown[] | null; error: { message?: string } | null }>,
): Promise<DbRow[]> {
  try {
    const { data, error } = await run();
    if (error) {
      if (env.NODE_ENV === "development") {
        console.warn(`[wallet service] ${table} query failed:`, error.message ?? error);
      }
      return [];
    }
    return asRows(data);
  } catch (error) {
    if (env.NODE_ENV === "development") {
      console.warn(`[wallet service] ${table} query threw:`, error);
    }
    return [];
  }
}

async function safeFetchSingle(
  table: string,
  run: () => Promise<{ data: unknown; error: { message?: string } | null }>,
): Promise<DbRow | null> {
  try {
    const { data, error } = await run();
    if (error) {
      if (env.NODE_ENV === "development") {
        console.warn(`[wallet service] ${table} query failed:`, error.message ?? error);
      }
      return null;
    }
    return asRecord(data);
  } catch (error) {
    if (env.NODE_ENV === "development") {
      console.warn(`[wallet service] ${table} query threw:`, error);
    }
    return null;
  }
}

function mapPresentationStatus(row: Pick<PresentationRow, "expires_at" | "revoked_at">): WalletShareRecordView["shareStatus"] {
  const expired = row.expires_at ? new Date(row.expires_at).getTime() < Date.now() : false;
  if (row.revoked_at) return "Revoked";
  if (expired) return "Expired";
  return "Active";
}

function deriveVerificationStatus(params: {
  attestation: DbRow | null;
  institutionRequest: DbRow | null;
  credentialMetadata: DbRow[];
}): string {
  const requestStatus = normalizedText(params.institutionRequest?.status);
  if (requestStatus === "approved" || requestStatus === "attested") return "Institution Attested";

  const validationStatus = asNullableText(params.attestation?.validation_status);
  if (validationStatus && normalizedText(validationStatus) !== "pending") return validationStatus;

  const validationResult = asNullableText(params.attestation?.validation_result);
  if (validationResult && normalizedText(validationResult) !== "pending") return validationResult;

  const approvedCredential = params.credentialMetadata.find((item) =>
    normalizedText(item.attestation_status) === "approved",
  );
  if (approvedCredential) return "Credential Issued";

  return "Unverified";
}

function rowToWalletRecord(row: PersistedWalletRow, summary: WalletEvidenceSummary): WalletCompetencyRecordView {
  return {
    id: row.id,
    learnerId: row.learner_id,
    competencyId: row.competency_id,
    competencyName: summary.competency.name,
    domain: summary.competency.domain,
    description: summary.competency.description,
    learnerDid: summary.learner.did,
    learnerIdentityReference: summary.learner.identityReference,
    status: row.status,
    practicalTaskStatus: row.practical_task_status,
    taskResult: summary.practicalTask.latestAttempt?.status ?? row.practical_task_status,
    verificationStatus: summary.status.verificationStatus,
    walletRecordStatus: summary.status.walletStatus,
    evidenceCount: summary.evidenceCount,
    sourceBadges: summary.sourceBadges,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    evidencePackage: summary,
  };
}

function buildDisclosedPayload(
  record: WalletCompetencyRecordView,
  selectedFields: WalletShareFieldId[],
): Record<string, unknown> {
  const hasField = (field: WalletShareFieldId) => selectedFields.includes(field);
  const payload: Record<string, unknown> = {};

  const competency: Record<string, unknown> = {};
  if (hasField("competency_name")) competency.name = record.competencyName;
  if (hasField("competency_domain")) competency.domain = record.domain;
  if (hasField("competency_description") && record.description) competency.description = record.description;
  if (Object.keys(competency).length > 0) payload.competency = competency;

  if (hasField("learner_did") && record.learnerDid) {
    payload.learner = { did: record.learnerDid };
  }

  const status: Record<string, unknown> = {};
  if (hasField("verification_status")) status.verificationStatus = record.verificationStatus;
  if (hasField("practical_task_result") && record.taskResult) {
    status.practicalTaskResult = record.taskResult;
  }
  if (Object.keys(status).length > 0) payload.status = status;

  const evidence: Record<string, unknown> = {};
  if (hasField("github_evidence")) {
    const githubEvidence = sanitizeForDisclosure({
      repos: record.evidencePackage.github.repos,
      activities: record.evidencePackage.github.activities,
      evidenceRecords: record.evidencePackage.github.evidenceRecords,
      reviews: record.evidencePackage.github.reviews,
    });
    if (githubEvidence) evidence.github = githubEvidence;
  }
  if (hasField("lms_evidence")) {
    const lmsEvidence = sanitizeForDisclosure({
      evidence: record.evidencePackage.lms.evidence,
      courses: record.evidencePackage.lms.courses,
      assignments: record.evidencePackage.lms.assignments,
      grades: record.evidencePackage.lms.grades,
      importedEvidence: record.evidencePackage.lms.importedEvidence,
    });
    if (lmsEvidence) evidence.lms = lmsEvidence;
  }
  if (hasField("practical_task_result")) {
    const practicalTask = sanitizeForDisclosure({
      latestAttempt: record.evidencePackage.practicalTask.latestAttempt,
    });
    if (practicalTask) evidence.practicalTask = practicalTask;
  }
  if (hasField("peer_reviews")) {
    const peerReviews = sanitizeForDisclosure(record.evidencePackage.peerReviews);
    if (peerReviews) evidence.peerReviews = peerReviews;
  }
  if (hasField("teacher_feedback")) {
    const teacherFeedback = sanitizeForDisclosure(record.evidencePackage.teacherFeedback);
    if (teacherFeedback) evidence.teacherFeedback = teacherFeedback;
  }
  if (hasField("complete_evidence_package")) {
    const completeEvidence = sanitizeForDisclosure({
      github: {
        repos: record.evidencePackage.github.repos,
        activities: record.evidencePackage.github.activities,
        evidenceRecords: record.evidencePackage.github.evidenceRecords,
        reviews: record.evidencePackage.github.reviews,
      },
      lms: {
        evidence: record.evidencePackage.lms.evidence,
        courses: record.evidencePackage.lms.courses,
        assignments: record.evidencePackage.lms.assignments,
        grades: record.evidencePackage.lms.grades,
        importedEvidence: record.evidencePackage.lms.importedEvidence,
      },
      practicalTask: record.evidencePackage.practicalTask,
      peerReviews: record.evidencePackage.peerReviews,
      teacherFeedback: record.evidencePackage.teacherFeedback,
      externalEvidence: record.evidencePackage.externalEvidence,
    });
    if (completeEvidence) evidence.completeEvidencePackage = completeEvidence;
  }
  if (Object.keys(evidence).length > 0) payload.evidence = evidence;

  if (hasField("timestamps")) {
    const timestamps = sanitizeForDisclosure(record.evidencePackage.evidenceTimestamps);
    if (timestamps) payload.timestamps = timestamps;
  }

  if (hasField("credential_metadata")) {
    const metadata = sanitizeForDisclosure(record.evidencePackage.credentialMetadata);
    if (metadata) payload.credentialMetadata = metadata;
  }

  return payload;
}

async function listSharesForCompetency(
  userId: string,
  competencyId: string,
): Promise<WalletShareRecordView[]> {
  const rows = await safeFetchRows("selective_disclosure_presentations", () =>
    db()
      .from("selective_disclosure_presentations")
      .select("id, competency_id, selected_fields, selection_mode, proof_type, share_token_hint, expires_at, revoked_at, created_at, updated_at")
      .eq("learner_id", userId)
      .eq("competency_id", competencyId)
      .order("created_at", { ascending: false }),
  );

  return rows.map((row) => ({
    id: asText(row.id),
    competencyId: asText(row.competency_id),
    selectedFields: Array.isArray(row.selected_fields)
      ? row.selected_fields.filter((item): item is WalletShareFieldId => typeof item === "string")
      : [],
    selectionMode: (asText(row.selection_mode) || "custom") as WalletShareRecordView["selectionMode"],
    proofType: asText(row.proof_type) || "SignedSelectiveDisclosure",
    shareStatus: mapPresentationStatus({
      expires_at: asNullableText(row.expires_at),
      revoked_at: asNullableText(row.revoked_at),
    }),
    tokenHint: asNullableText(row.share_token_hint),
    createdAt: asNullableText(row.created_at) ?? new Date().toISOString(),
    updatedAt: asNullableText(row.updated_at) ?? asNullableText(row.created_at) ?? new Date().toISOString(),
    expiresAt: asNullableText(row.expires_at),
    revokedAt: asNullableText(row.revoked_at),
  }));
}

async function persistWalletRecord(record: WalletCompetencyRecordView): Promise<void> {
  const payload = {
    learner_id: record.learnerId,
    competency_id: record.competencyId,
    competency_name: record.competencyName,
    status: record.status,
    practical_task_status: record.practicalTaskStatus,
    evidence_summary: record.evidencePackage,
    updated_at: record.updatedAt,
  };

  const result = await db()
    .from("wallet_competency_records")
    .upsert(payload, { onConflict: "learner_id,competency_id" });

  if (result?.error) {
    const message = asText(result.error.message);
    if (
      !message.includes("wallet_competency_records")
      && env.NODE_ENV === "development"
    ) {
      console.warn("[wallet service] persist wallet record failed:", message);
    }
  }
}

async function loadAggregatedWallet(userId: string): Promise<WalletCompetencyRecordView[]> {
  const learnerProfile = await safeFetchSingle("learner_profiles", () =>
    db()
      .from("learner_profiles")
      .select("holder_did, student_id, first_name, last_name, institution_name")
      .eq("user_id", userId)
      .maybeSingle(),
  );

  const [
    skillRows,
    githubRepos,
    githubRepoLinks,
    githubActivities,
    evidenceRecords,
    lmsEvidence,
    moodleCourses,
    moodleAssignments,
    moodleGrades,
    moodleFeedback,
    importedLmsEvidence,
    practicalAttempts,
    mcqAttempts,
    peerReviews,
    supportingRecords,
    attestationRows,
    institutionRequests,
    credentialRows,
  ] = await Promise.all([
    safeFetchRows("declared_skills", () =>
      db()
        .from("declared_skills")
        .select("id, name, domain, description, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: true }),
    ),
    safeFetchRows("github_repos", () =>
      db()
        .from("github_repos")
        .select("id, linked_skill_id, repo_name, full_name, github_url, primary_language, commit_count, last_updated, synced_at")
        .eq("user_id", userId),
    ),
    safeFetchRows("github_repo_skill_links", () =>
      db()
        .from("github_repo_skill_links")
        .select("github_repo_id, skill_id")
        .eq("user_id", userId),
    ),
    safeFetchRows("github_activities", () =>
      db()
        .from("github_activities")
        .select("id, linked_skill_id, activity_type, activity_title, activity_url, repo_name, commit_hash, occurred_at, synced_at")
        .eq("user_id", userId),
    ),
    safeFetchRows("evidence_records", () =>
      db()
        .from("evidence_records")
        .select("id, mapped_skill_id, suggested_skill_id, source, repository_name, repository_url, language, commit_count, pr_summary, sync_date, status, external_id")
        .eq("user_id", userId),
    ),
    safeFetchRows("lms_evidence", () =>
      db()
        .from("lms_evidence")
        .select("id, linked_skill_id, source, course_name, course_code, grade, completion_status, text_preview, fetched_at, evidence_hash")
        .eq("user_id", userId),
    ),
    safeFetchRows("moodle_courses", () =>
      db()
        .from("moodle_courses")
        .select("moodle_course_id, fullname, shortname, synced_at")
        .eq("user_id", userId),
    ),
    safeFetchRows("moodle_assignments", () =>
      db()
        .from("moodle_assignments")
        .select("moodle_course_id, moodle_assignment_id, name, module_type, submission_status, grade, grade_max, grade_formatted, graded_at, submitted_at, submission_text, competency_tags, synced_at")
        .eq("user_id", userId),
    ),
    safeFetchRows("moodle_grades", () =>
      db()
        .from("moodle_grades")
        .select("moodle_course_id, item_id, item_name, item_type, grade, grade_max, grade_formatted, synced_at")
        .eq("user_id", userId),
    ),
    safeFetchRows("moodle_feedback", () =>
      db()
        .from("moodle_feedback")
        .select("moodle_assignment_id, feedback_text, synced_at")
        .eq("user_id", userId),
    ),
    safeFetchRows("imported_lms_evidence", () =>
      db()
        .from("imported_lms_evidence")
        .select("id, moodle_course_id, moodle_assignment_id, course_name, activity_name, activity_type, grade, grade_max, submission_status, feedback_preview, lms_evidence_id, imported_at")
        .eq("user_id", userId),
    ),
    safeFetchRows("practical_attempts", () =>
      db()
        .from("practical_attempts")
        .select("attempt_id, skill_id, status, submission, updated_at, created_at")
        .eq("user_id", userId),
    ),
    safeFetchRows("mcq_task_attempts", () =>
      db()
        .from("mcq_task_attempts")
        .select("id, skill_id, competency_name, competency_domain, title, status, learner_answers, answer_key, questions, passed, feedback, submitted_at, created_at")
        .eq("learner_user_id", userId),
    ),
    safeFetchRows("peer_reviews", () =>
      db()
        .from("peer_reviews")
        .select("id, skill_id, skill, competency_name, reviewer_name, reviewer_role, source, review_text, comment, recommendation, reviewed_at, review_date, created_at, external_reference")
        .eq("learner_user_id", userId),
    ),
    safeFetchRows("supporting_records", () =>
      db()
        .from("supporting_records")
        .select("id, skill_id, source, title, url, occurred_at, created_at")
        .eq("user_id", userId),
    ),
    safeFetchRows("attestations", () =>
      db()
        .from("attestations")
        .select("skill_id, validation_status, validation_result, status, remarks, submitted_at, updated_at")
        .eq("learner_user_id", userId),
    ),
    safeFetchRows("institution_attestation_requests", () =>
      db()
        .from("institution_attestation_requests")
        .select("skill_id, status, institution_feedback, reviewed_at, updated_at")
        .eq("learner_user_id", userId),
    ),
    safeFetchRows("credentials", () =>
      db()
        .from("credentials")
        .select("credential_uri, name, issuer_name, issuer_did, holder_did, valid_from, verification_status, attestation_status, skill_name")
        .eq("user_id", userId),
    ),
  ]);

  const repoLinksBySkill = new Map<string, Set<string>>();
  for (const link of githubRepoLinks) {
    const skillId = asText(link.skill_id);
    const repoId = asText(link.github_repo_id);
    if (!skillId || !repoId) continue;
    const bucket = repoLinksBySkill.get(skillId) ?? new Set<string>();
    bucket.add(repoId);
    repoLinksBySkill.set(skillId, bucket);
  }

  const records = skillRows.map((skill) => {
    const competencyId = asText(skill.id);
    const competencyName = asText(skill.name);
    const domain = asText(skill.domain) || "General";
    const description = asText(skill.description);
    const linkedRepoIds = repoLinksBySkill.get(competencyId) ?? new Set<string>();

    const skillGithubRepos = dedupeByKey(
      githubRepos.filter((row) =>
        asText(row.linked_skill_id) === competencyId || linkedRepoIds.has(asText(row.id)),
      ),
      (row) => asText(row.id) || asText(row.full_name) || asText(row.repo_name),
    );

    const skillGithubActivities = dedupeByKey(
      githubActivities.filter((row) => asText(row.linked_skill_id) === competencyId),
      (row) => asText(row.id),
    );

    const skillGithubEvidenceRecords = dedupeByKey(
      evidenceRecords.filter((row) =>
        asText(row.mapped_skill_id) === competencyId || asText(row.suggested_skill_id) === competencyId,
      ),
      (row) => asText(row.id) || asText(row.external_id),
    );

    const skillLmsEvidence = dedupeByKey(
      lmsEvidence.filter((row) => asText(row.linked_skill_id) === competencyId),
      (row) => asText(row.id) || `${asText(row.course_name)}:${asText(row.course_code)}`,
    );

    const lmsEvidenceIds = new Set(skillLmsEvidence.map((row) => asText(row.id)).filter(Boolean));
    const skillImportedLmsEvidence = dedupeByKey(
      importedLmsEvidence.filter((row) => lmsEvidenceIds.has(asText(row.lms_evidence_id))),
      (row) => asText(row.id) || asText(row.moodle_assignment_id),
    );

    const assignmentIds = new Set(
      skillImportedLmsEvidence
        .map((row) => asText(row.moodle_assignment_id))
        .filter(Boolean),
    );
    const courseIds = new Set(
      skillImportedLmsEvidence
        .map((row) => asText(row.moodle_course_id))
        .filter(Boolean),
    );

    const skillMoodleAssignments = dedupeByKey(
      moodleAssignments.filter((row) => assignmentIds.has(asText(row.moodle_assignment_id))),
      (row) => asText(row.moodle_assignment_id),
    );
    const skillMoodleCourses = dedupeByKey(
      moodleCourses.filter((row) => courseIds.has(asText(row.moodle_course_id))),
      (row) => asText(row.moodle_course_id),
    );
    const skillMoodleGrades = dedupeByKey(
      moodleGrades.filter((row) => courseIds.has(asText(row.moodle_course_id))),
      (row) => `${asText(row.moodle_course_id)}:${asText(row.item_id)}`,
    );
    const skillTeacherFeedback = dedupeByKey(
      moodleFeedback
        .filter((row) => assignmentIds.has(asText(row.moodle_assignment_id)))
        .map((row) => ({
          source: "Moodle Teacher Feedback",
          feedback_text: asNullableText(row.feedback_text),
          reviewed_at: asNullableText(row.synced_at),
          status: "Available",
          moodle_assignment_id: asText(row.moodle_assignment_id),
        })),
      (row) => `${asText(row.moodle_assignment_id)}:${asText(row.reviewed_at)}`,
    );

    const githubReviews = dedupeByKey(
      peerReviews.filter((row) =>
        (normalizedText(row.source).includes("github") || normalizedText(row.external_reference).startsWith("github:"))
        && (
          asText(row.skill_id) === competencyId
          || competencyMatches(row.skill, competencyName)
          || competencyMatches(row.competency_name, competencyName)
        ),
      ),
      (row) => asText(row.id) || asText(row.external_reference),
    );

    const skillPeerReviews = dedupeByKey(
      peerReviews.filter((row) =>
        !githubReviews.some((review) => asText(review.id) === asText(row.id))
        && (
          asText(row.skill_id) === competencyId
          || competencyMatches(row.skill, competencyName)
          || competencyMatches(row.competency_name, competencyName)
        ),
      ),
      (row) => asText(row.id) || asText(row.external_reference),
    );

    const skillExternalEvidence = dedupeByKey(
      supportingRecords.filter((row) => asText(row.skill_id) === competencyId),
      (row) => asText(row.id) || `${asText(row.title)}:${asText(row.url)}`,
    );

    const skillCredentialMetadata = dedupeByKey(
      credentialRows.filter((row) => competencyMatches(row.skill_name, competencyName)),
      (row) => asText(row.credential_uri),
    );

    const attestation = sortByLatest(
      attestationRows.filter((row) => asText(row.skill_id) === competencyId),
      ["updated_at", "submitted_at"],
    )[0] ?? null;

    const institutionRequest = sortByLatest(
      institutionRequests.filter((row) => asText(row.skill_id) === competencyId),
      ["reviewed_at", "updated_at"],
    )[0] ?? null;

    const mcqHistory = sortByLatest(
      mcqAttempts.filter((row) => asText(row.skill_id) === competencyId),
      ["submitted_at", "created_at"],
    )
      .map(buildAttemptHistoryItem)
      .filter((item): item is WalletAttemptHistoryItem => item !== null);

    const practicalAttempt = practicalAttempts.find((row) => asText(row.skill_id) === competencyId);
    if (mcqHistory.length === 0 && practicalAttempt) {
      const session = parseSubmissionSession(practicalAttempt.submission);
      const fallbackAttempt = buildAttemptHistoryItem({
        attempt_id: practicalAttempt.attempt_id,
        title: competencyName ? `${competencyName} practical task` : "Practical task",
        status: practicalAttempt.status,
        score: session?.resultPercentage,
        resultCorrectCount: session?.resultCorrectCount,
        resultTotalQuestions: session?.resultTotalQuestions,
        passed: session?.passed === true,
        updated_at: practicalAttempt.updated_at,
        created_at: practicalAttempt.created_at,
      });
      if (fallbackAttempt) mcqHistory.push(fallbackAttempt);
    }

    const latestAttempt = mcqHistory[0] ?? null;
    const verificationStatus = deriveVerificationStatus({
      attestation,
      institutionRequest,
      credentialMetadata: skillCredentialMetadata,
    });
    const reviewCount = skillPeerReviews.length + skillTeacherFeedback.length;

    const summaryBase: WalletEvidenceSummary = {
      competency: {
        id: competencyId,
        name: competencyName,
        domain,
        description,
      },
      learner: {
        id: userId,
        did: asNullableText(learnerProfile?.holder_did),
        identityReference: asNullableText(learnerProfile?.student_id),
      },
      github: {
        repos: sortByLatest(skillGithubRepos, ["last_updated", "synced_at"]),
        activities: sortByLatest(skillGithubActivities, ["occurred_at", "synced_at"]),
        evidenceRecords: sortByLatest(skillGithubEvidenceRecords, ["sync_date"]),
        reviews: sortByLatest(githubReviews, ["reviewed_at", "review_date", "created_at"]),
      },
      lms: {
        evidence: sortByLatest(skillLmsEvidence, ["fetched_at"]),
        courses: sortByLatest(skillMoodleCourses, ["synced_at"]),
        assignments: sortByLatest(skillMoodleAssignments, ["submitted_at", "graded_at", "synced_at"]),
        grades: sortByLatest(skillMoodleGrades, ["synced_at"]),
        importedEvidence: sortByLatest(skillImportedLmsEvidence, ["imported_at"]),
      },
      practicalTask: {
        latestAttempt,
        attemptHistory: mcqHistory,
      },
      peerReviews: sortByLatest(skillPeerReviews, ["reviewed_at", "review_date", "created_at"]),
      teacherFeedback: sortByLatest(skillTeacherFeedback, ["reviewed_at"]),
      externalEvidence: sortByLatest(skillExternalEvidence, ["occurred_at", "created_at"]),
      institutionReview: {
        status: asNullableText(institutionRequest?.status) ?? asNullableText(attestation?.status),
        feedback: asNullableText(institutionRequest?.institution_feedback) ?? asNullableText(attestation?.remarks),
        reviewedAt: asNullableText(institutionRequest?.reviewed_at) ?? asNullableText(attestation?.updated_at),
      },
      credentialMetadata: skillCredentialMetadata,
      evidenceTimestamps: {
        github: sortStringsByLatest([
          ...skillGithubRepos.map((row) => asNullableText(row.last_updated) ?? asNullableText(row.synced_at)),
          ...skillGithubActivities.map((row) => asNullableText(row.occurred_at) ?? asNullableText(row.synced_at)),
          ...skillGithubEvidenceRecords.map((row) => asNullableText(row.sync_date)),
          ...githubReviews.map((row) => asNullableText(row.reviewed_at) ?? asNullableText(row.review_date) ?? asNullableText(row.created_at)),
        ]),
        lms: sortStringsByLatest([
          ...skillLmsEvidence.map((row) => asNullableText(row.fetched_at)),
          ...skillMoodleCourses.map((row) => asNullableText(row.synced_at)),
          ...skillMoodleAssignments.map((row) => asNullableText(row.submitted_at) ?? asNullableText(row.graded_at) ?? asNullableText(row.synced_at)),
          ...skillMoodleGrades.map((row) => asNullableText(row.synced_at)),
          ...skillImportedLmsEvidence.map((row) => asNullableText(row.imported_at)),
        ]),
        practicalTask: sortStringsByLatest(mcqHistory.map((item) => item.submittedAt)),
        peerReviews: sortStringsByLatest(skillPeerReviews.map((row) =>
          asNullableText(row.reviewed_at) ?? asNullableText(row.review_date) ?? asNullableText(row.created_at),
        )),
        teacherFeedback: sortStringsByLatest(skillTeacherFeedback.map((row) => asNullableText(row.reviewed_at))),
        externalEvidence: sortStringsByLatest(skillExternalEvidence.map((row) =>
          asNullableText(row.occurred_at) ?? asNullableText(row.created_at),
        )),
      },
      sourceBadges: [],
      evidenceCount: 0,
      status: {
        taskStatus: latestAttempt?.status ?? null,
        reviewStatus: reviewCount > 0 ? "Review Available" : "Pending Review",
        verificationStatus,
        walletStatus: "Evidence Collected",
      },
      metadata: {
        createdAt: asNullableText(skill.created_at) ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        evidenceCount: 0,
        sourceMetadata: [],
        evidenceHashes: [],
      },
    };

    const sourceBadges = deriveWalletSourceBadges({
      github: [
        ...summaryBase.github.repos,
        ...summaryBase.github.activities,
        ...summaryBase.github.evidenceRecords,
        ...summaryBase.github.reviews,
      ],
      lms: [
        ...summaryBase.lms.evidence,
        ...summaryBase.lms.courses,
        ...summaryBase.lms.assignments,
        ...summaryBase.lms.grades,
        ...summaryBase.lms.importedEvidence,
      ],
      practicalTasks: summaryBase.practicalTask.attemptHistory,
      reviews: [...summaryBase.peerReviews, ...summaryBase.teacherFeedback],
    });

    const evidenceCount = countWalletEvidence(summaryBase);
    const walletStatus = deriveWalletRecordStatus({
      githubCount:
        summaryBase.github.repos.length
        + summaryBase.github.activities.length
        + summaryBase.github.evidenceRecords.length
        + summaryBase.github.reviews.length,
      lmsCount:
        summaryBase.lms.evidence.length
        + summaryBase.lms.courses.length
        + summaryBase.lms.assignments.length
        + summaryBase.lms.grades.length
        + summaryBase.lms.importedEvidence.length
        + summaryBase.externalEvidence.length,
      practicalTaskStatus: latestAttempt?.status ?? null,
      reviewCount,
    });

    const updatedAt = sortStringsByLatest([
      ...summaryBase.evidenceTimestamps.github,
      ...summaryBase.evidenceTimestamps.lms,
      ...summaryBase.evidenceTimestamps.practicalTask,
      ...summaryBase.evidenceTimestamps.peerReviews,
      ...summaryBase.evidenceTimestamps.teacherFeedback,
      ...summaryBase.evidenceTimestamps.externalEvidence,
      asNullableText(institutionRequest?.reviewed_at),
      asNullableText(institutionRequest?.updated_at),
      asNullableText(attestation?.updated_at),
      asNullableText(skill.created_at),
    ])[0] ?? new Date().toISOString();

    const summary: WalletEvidenceSummary = {
      ...summaryBase,
      sourceBadges,
      evidenceCount,
      status: {
        ...summaryBase.status,
        walletStatus,
      },
      metadata: {
        createdAt: asNullableText(skill.created_at) ?? updatedAt,
        updatedAt,
        evidenceCount,
        sourceMetadata: sourceBadges,
        evidenceHashes: [],
      },
    };

    summary.metadata.evidenceHashes = extractEvidenceHashes(summary);

    const persistedRow: PersistedWalletRow = {
      id: `derived-${competencyId}`,
      learner_id: userId,
      competency_id: competencyId,
      competency_name: competencyName,
      status: walletStatus,
      practical_task_status: latestAttempt?.status ?? null,
      evidence_summary: summary,
      created_at: summary.metadata.createdAt,
      updated_at: summary.metadata.updatedAt,
    };

    return rowToWalletRecord(persistedRow, summary);
  });

  return records
    .filter((record) => record.evidencePackage.practicalTask.attemptHistory.length > 0)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

function buildVerificationResult(params: {
  row: PresentationRow;
  disclosedPayload: Record<string, unknown>;
}): PublicPresentationVerification {
  const expired = params.row.expires_at ? new Date(params.row.expires_at).getTime() < Date.now() : false;
  const revoked = Boolean(params.row.revoked_at);
  const payloadHashMatches = hashDisclosurePayload(params.disclosedPayload) === params.row.payload_hash;
  const learnerDid = params.row.verification_method?.split("#")[0] ?? null;
  const proofValid = params.row.proof_value
    ? verifySelectiveDisclosureProof({
        learnerDid,
        competencyId: params.row.competency_id,
        learnerId: params.row.learner_id,
        payloadHash: params.row.payload_hash,
        createdAt: params.row.created_at,
        expiresAt: params.row.expires_at,
        proof: { proofValue: params.row.proof_value },
      })
    : false;

  const recordUnmodified = payloadHashMatches;
  let result: PublicPresentationVerification["result"] = "Invalid/Tampered";
  if (revoked) result = "Revoked";
  else if (expired) result = "Expired";
  else if (payloadHashMatches && proofValid && recordUnmodified) result = "Valid Proof";

  return {
    tokenValid: true,
    expired,
    revoked,
    payloadHashMatches,
    proofValid,
    recordUnmodified,
    result,
  };
}

async function loadPresentationByToken(token: string): Promise<PresentationRow> {
  const tokenHash = generateSha256Hash(token);
  const row = await safeFetchSingle("selective_disclosure_presentations", () =>
    db()
      .from("selective_disclosure_presentations")
      .select("*")
      .eq("share_token_hash", tokenHash)
      .maybeSingle(),
  );

  if (!row) throw new AppError("Presentation not found", 404);

  return {
    id: asText(row.id),
    learner_id: asText(row.learner_id),
    competency_id: asText(row.competency_id),
    selected_fields: Array.isArray(row.selected_fields)
      ? row.selected_fields.filter((item): item is WalletShareFieldId => typeof item === "string")
      : [],
    selection_mode: asText(row.selection_mode),
    disclosed_payload: asRecord(row.disclosed_payload) ?? {},
    payload_hash: asText(row.payload_hash),
    proof_type: asText(row.proof_type),
    proof_value: asNullableText(row.proof_value),
    verification_method: asNullableText(row.verification_method),
    share_token_hash: asText(row.share_token_hash),
    share_token_hint: asNullableText(row.share_token_hint),
    expires_at: asNullableText(row.expires_at),
    revoked_at: asNullableText(row.revoked_at),
    created_at: asNullableText(row.created_at) ?? new Date().toISOString(),
    updated_at: asNullableText(row.updated_at) ?? asNullableText(row.created_at) ?? new Date().toISOString(),
  };
}

export class WalletService {
  async getCompetencies(userId: string): Promise<WalletCompetencyRecordView[]> {
    return loadAggregatedWallet(userId);
  }

  async getCompetency(userId: string, competencyId: string): Promise<WalletCompetencyDetailView> {
    const records = await loadAggregatedWallet(userId);
    const record = records.find((item) => item.competencyId === competencyId);
    if (!record) throw new AppError("Competency wallet record not found", 404);
    const shares = await listSharesForCompetency(userId, competencyId);
    return { record, shares };
  }

  async syncCompetency(userId: string, competencyId: string): Promise<WalletCompetencyRecordView> {
    const records = await loadAggregatedWallet(userId);
    const record = records.find((item) => item.competencyId === competencyId);
    if (!record) throw new AppError("Competency wallet record not found", 404);
    await persistWalletRecord(record);
    return record;
  }

  async shareCompetency(
    userId: string,
    competencyId: string,
    input: ShareWalletCompetencyInput,
  ): Promise<ShareWalletCompetencyResult> {
    const record = await this.syncCompetency(userId, competencyId);
    const disclosedPayload = buildDisclosedPayload(record, input.selectedFields);

    if (Object.keys(disclosedPayload).length === 0) {
      throw new AppError("Selected fields did not produce a shareable payload", 400);
    }

    const token = randomUUID();
    const tokenHash = generateSha256Hash(token);
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + (input.expiresInDays ?? 30) * 86_400_000).toISOString();
    const payloadHash = hashDisclosurePayload(disclosedPayload);
    const proof = buildSelectiveDisclosureProof({
      learnerDid: record.learnerDid,
      competencyId,
      learnerId: userId,
      payloadHash,
      createdAt,
      expiresAt,
    });

    const { data, error } = await db()
      .from("selective_disclosure_presentations")
      .insert({
        learner_id: userId,
        competency_id: competencyId,
        selected_fields: input.selectedFields,
        selection_mode: input.selectionMode,
        disclosed_payload: disclosedPayload,
        payload_hash: payloadHash,
        proof_type: "SignedSelectiveDisclosure",
        proof_value: proof.proofValue,
        verification_method: proof.verificationMethod,
        share_token_hash: tokenHash,
        share_token_hint: token.slice(0, 8),
        expires_at: expiresAt,
      })
      .select("id, expires_at")
      .single();

    if (error) {
      throw new AppError(error.message, 500);
    }

    return {
      shareId: asText((data as DbRow).id),
      shareUrl: `${env.FRONTEND_URL.replace(/\/$/, "")}/recruiter/verify/${encodeURIComponent(token)}`,
      token,
      tokenHint: token.slice(0, 8),
      proofType: "SignedSelectiveDisclosure",
      expiresAt: asNullableText((data as DbRow).expires_at),
    };
  }

  async revokeShare(userId: string, shareId: string): Promise<void> {
    const { error } = await db()
      .from("selective_disclosure_presentations")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", shareId)
      .eq("learner_id", userId);

    if (error) throw new AppError(error.message, 500);
  }

  async getPublicPresentation(token: string): Promise<PublicPresentationView> {
    const row = await loadPresentationByToken(token);
    const verification = buildVerificationResult({
      row,
      disclosedPayload: row.disclosed_payload,
    });

    return {
      id: row.id,
      competencyId: row.competency_id,
      selectedFields: row.selected_fields,
      selectionMode: (row.selection_mode || "custom") as PublicPresentationView["selectionMode"],
      disclosedPayload: row.disclosed_payload,
      proofType: row.proof_type || "SignedSelectiveDisclosure",
      verificationMethod: row.verification_method,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
      payloadHash: row.payload_hash,
      proofValue: row.proof_value,
      verification,
    };
  }

  async verifyPublicPresentation(
    token: string,
    disclosedPayload?: Record<string, unknown>,
  ): Promise<PublicPresentationView> {
    const row = await loadPresentationByToken(token);
    const verification = buildVerificationResult({
      row,
      disclosedPayload: disclosedPayload ?? row.disclosed_payload,
    });

    return {
      id: row.id,
      competencyId: row.competency_id,
      selectedFields: row.selected_fields,
      selectionMode: (row.selection_mode || "custom") as PublicPresentationView["selectionMode"],
      disclosedPayload: row.disclosed_payload,
      proofType: row.proof_type || "SignedSelectiveDisclosure",
      verificationMethod: row.verification_method,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
      payloadHash: row.payload_hash,
      proofValue: row.proof_value,
      verification,
    };
  }
}

export const walletService = new WalletService();
