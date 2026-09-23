import { randomUUID } from "node:crypto";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";
import { generateSha256Hash } from "../utils/generateHash";
import {
  buildSelectiveDisclosureProof,
  hashDisclosurePayload,
  verifySelectiveDisclosureProof,
} from "./proof.service";
import { getRequestSupabase, getServiceSupabase, runWithServiceDb } from "../config/supabase";
import { resolveLearnerDisplayName } from "../utils/learnerDisplayName";
import {
  aggregateLmsEvidenceForCompetency,
  isLmsPeerReviewRow,
} from "../utils/moodle-evidence-matching";
import {
  buildLmsBundleFromEvidenceRecords,
  logWalletLoad,
  splitEvidenceRecordsBySource,
} from "../utils/wallet-evidence-mapping";
import {
  WALLET_SHARE_FIELD_IDS,
  type PublicPresentationVerification,
  type PublicPresentationView,
  type ShareWalletCompetencyInput,
  type ShareWalletCompetencyResult,
  type WalletAttemptHistoryItem,
  type WalletCompetencyDetailView,
  type WalletCompetencyRecordView,
  type WalletEvidenceSummary,
  type WalletPracticalTaskStatus,
  type WalletRecordStatus,
  type WalletShareFieldId,
  type WalletShareRecordView,
  type WalletSourceBadge,
} from "../types/wallet.types";
import type {
  PublicCompetencyResponse,
  PublicCredentialResponse,
} from "../types/public-credential.types";
import {
  atsResumeToPlainText,
  buildAtsResume,
  buildEvidenceLedger,
  competencyFromSharePayload,
} from "../utils/public-credential-map";
import { walletExportAvailability } from "./wallet-pass.service";

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
  return getRequestSupabase() as unknown as {
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
}): WalletPracticalTaskStatus {
  if (params.passed) return "Passed";
  if (params.scorePercent != null) return "Needs Improvement";
  return "Task Submitted";
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
  if (params.practicalTaskStatus === "Task Submitted") return "Task Submitted";
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
  const passed = row.passed === true || (scorePercent != null && scorePercent >= 60);
  const submittedAt = asNullableText(row.submitted_at ?? row.updated_at ?? row.created_at);

  if (!title && !submittedAt && scorePercent == null && !attemptId) {
    return null;
  }

  return {
    attemptId,
    title,
    status: deriveWalletPracticalTaskStatus({ passed, scorePercent }),
    submittedAt,
    scorePercent,
    correctCount,
    totalQuestions,
    passed,
  };
}

function throwDbError(error: { message?: string }, context: string): never {
  const message = error.message ?? "Database error";
  if (/schema cache|could not find the table/i.test(message)) {
    throw new AppError(
      `${context}: run supabase/scripts/apply-selective-disclosure-presentations.sql in the Supabase SQL Editor, then retry.`,
      503,
    );
  }
  throw new AppError(message, 500);
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

type LearnerDisclosureContext = {
  displayName: string | null;
  institution: string | null;
  program: string | null;
  cityCountry: string | null;
  skillsSummary: string | null;
  careerGoal: string | null;
  email: string | null;
  phone: string | null;
  photoUrl: string | null;
};

function buildSkillEvidenceSlice(
  record: WalletCompetencyRecordView,
  selectedFields: WalletShareFieldId[],
): Record<string, unknown> | undefined {
  const hasField = (field: WalletShareFieldId) => selectedFields.includes(field);
  const evidence: Record<string, unknown> = {};
  if (hasField("github_evidence") || hasField("complete_evidence_package")) {
    const githubEvidence = sanitizeForDisclosure({
      repos: record.evidencePackage.github.repos,
      activities: record.evidencePackage.github.activities,
      evidenceRecords: record.evidencePackage.github.evidenceRecords,
      reviews: record.evidencePackage.github.reviews,
    });
    if (githubEvidence) evidence.github = githubEvidence;
  }
  if (hasField("lms_evidence") || hasField("complete_evidence_package")) {
    const lmsEvidence = sanitizeForDisclosure({
      evidence: record.evidencePackage.lms.evidence,
      courses: record.evidencePackage.lms.courses,
      assignments: record.evidencePackage.lms.assignments,
      grades: record.evidencePackage.lms.grades,
      importedEvidence: record.evidencePackage.lms.importedEvidence,
    });
    if (lmsEvidence) evidence.lms = lmsEvidence;
  }
  if (hasField("practical_task_result") || hasField("complete_evidence_package")) {
    const practicalTask = sanitizeForDisclosure({
      latestAttempt: record.evidencePackage.practicalTask.latestAttempt,
      attemptHistory: record.evidencePackage.practicalTask.attemptHistory,
    });
    if (practicalTask) evidence.practicalTask = practicalTask;
  }
  if (hasField("peer_reviews") || hasField("complete_evidence_package")) {
    const peerReviews = sanitizeForDisclosure(record.evidencePackage.peerReviews);
    if (peerReviews) evidence.peerReviews = peerReviews;
  }
  if (hasField("teacher_feedback") || hasField("complete_evidence_package")) {
    const teacherFeedback = sanitizeForDisclosure(record.evidencePackage.teacherFeedback);
    if (teacherFeedback) evidence.teacherFeedback = teacherFeedback;
  }
  return Object.keys(evidence).length > 0 ? evidence : undefined;
}

function buildDisclosedPayload(
  record: WalletCompetencyRecordView,
  selectedFields: WalletShareFieldId[],
  learnerContext?: LearnerDisclosureContext,
  siblingRecords: WalletCompetencyRecordView[] = [],
): Record<string, unknown> {
  const hasField = (field: WalletShareFieldId) => selectedFields.includes(field);
  const payload: Record<string, unknown> = {};

  const competency: Record<string, unknown> = {
    competencyId: record.competencyId,
  };
  if (hasField("competency_name")) competency.name = record.competencyName;
  if (hasField("competency_domain")) competency.domain = record.domain;
  if (hasField("competency_description") && record.description) competency.description = record.description;
  if (Object.keys(competency).length > 1 || hasField("competency_name")) payload.competency = competency;

  const learner: Record<string, unknown> = {};
  if (hasField("learner_did") && record.learnerDid) learner.did = record.learnerDid;
  if (hasField("learner_name") && learnerContext?.displayName) learner.name = learnerContext.displayName;
  if (hasField("learner_institution") && learnerContext?.institution) learner.institution = learnerContext.institution;
  if (hasField("learner_program") && learnerContext?.program) learner.program = learnerContext.program;
  if (hasField("learner_location") && learnerContext?.cityCountry) learner.cityCountry = learnerContext.cityCountry;
  if (hasField("learner_skills_summary") && learnerContext?.skillsSummary) learner.skillsSummary = learnerContext.skillsSummary;
  if (hasField("learner_career_goal") && learnerContext?.careerGoal) learner.careerGoal = learnerContext.careerGoal;
  if (hasField("learner_photo")) {
    learner.photoHidden = false;
    if (learnerContext?.photoUrl) learner.photoUrl = learnerContext.photoUrl;
  } else {
    learner.photoHidden = true;
  }
  if (hasField("learner_contact")) {
    const contact: Record<string, unknown> = {};
    if (learnerContext?.email) contact.email = learnerContext.email;
    if (learnerContext?.phone) contact.phone = learnerContext.phone;
    if (Object.keys(contact).length > 0) learner.contact = contact;
  }
  if (Object.keys(learner).length > 0) payload.learner = learner;

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

  const includeSiblingSkills = hasField("competency_name")
    || hasField("learner_skills_summary")
    || hasField("complete_evidence_package");
  const skillRows: Record<string, unknown>[] = [];
  if (hasField("competency_name") || hasField("complete_evidence_package")) {
    const primarySkill: Record<string, unknown> = {
      competencyId: record.competencyId,
      primary: true,
      evidenceBacked: record.evidenceCount > 0,
    };
    if (hasField("competency_name")) primarySkill.name = record.competencyName;
    if (hasField("competency_domain")) primarySkill.domain = record.domain;
    if (hasField("competency_description") && record.description) primarySkill.description = record.description;
    const primaryEvidence = buildSkillEvidenceSlice(record, selectedFields);
    if (primaryEvidence) primarySkill.evidence = primaryEvidence;
    skillRows.push(primarySkill);
  }
  if (includeSiblingSkills) {
    for (const sibling of siblingRecords) {
      if (sibling.competencyId === record.competencyId) continue;
      const row: Record<string, unknown> = {
        competencyId: sibling.competencyId,
        primary: false,
        evidenceBacked: sibling.evidenceCount > 0,
        name: sibling.competencyName,
      };
      if (hasField("competency_domain") && sibling.domain) row.domain = sibling.domain;
      const siblingEvidence = buildSkillEvidenceSlice(sibling, selectedFields);
      if (siblingEvidence) row.evidence = siblingEvidence;
      skillRows.push(row);
    }
  }
  if (skillRows.length > 0) payload.skills = skillRows;

  return payload;
}

async function hydrateSharedWalletPayload(row: PresentationRow): Promise<Record<string, unknown>> {
  const payload: Record<string, unknown> = { ...row.disclosed_payload };
  let records: WalletCompetencyRecordView[] = [];
  try {
    records = await runWithServiceDb(() => loadAggregatedWallet(row.learner_id));
  } catch {
    return payload;
  }
  if (records.length === 0) return payload;

  const fields: WalletShareFieldId[] = row.selected_fields.length > 0
    ? [...row.selected_fields]
    : ["competency_name"];
  const shareScope = payload.shareScope === "selected" ? "selected" : "all";
  const scopedRecords = shareScope === "selected"
    ? records.filter((record) => record.competencyId === row.competency_id)
    : records;
  const includeNames = fields.includes("competency_name")
    || fields.includes("learner_skills_summary")
    || fields.includes("complete_evidence_package");
  const primaryId = row.competency_id;
  if (includeNames) {
    payload.skills = scopedRecords
      .filter((record) => record.competencyName.trim())
      .map((record) => ({
        competencyId: record.competencyId,
        name: record.competencyName,
        domain: fields.includes("competency_domain") ? record.domain : undefined,
        description: fields.includes("competency_description") ? record.description : undefined,
        primary: record.competencyId === primaryId,
        evidenceBacked: record.evidenceCount > 0,
        evidence: buildSkillEvidenceSlice(record, fields),
      }));
  }

  const includeGithub = fields.includes("github_evidence") || fields.includes("complete_evidence_package");
  const includeLms = fields.includes("lms_evidence") || fields.includes("complete_evidence_package");
  if (includeGithub || includeLms) {
    const existingEvidence = asRecord(payload.evidence) ?? {};
    const nextEvidence: Record<string, unknown> = { ...existingEvidence };
    if (includeGithub) {
      nextEvidence.github = {
        ...(asRecord(existingEvidence.github) ?? {}),
        repos: scopedRecords.flatMap((record) => record.evidencePackage.github.repos),
      };
    }
    if (includeLms) {
      nextEvidence.lms = {
        ...(asRecord(existingEvidence.lms) ?? {}),
        courses: scopedRecords.flatMap((record) => record.evidencePackage.lms.courses),
        assignments: scopedRecords.flatMap((record) => record.evidencePackage.lms.assignments),
      };
    }
    payload.evidence = nextEvidence;
  }

  if (fields.includes("credential_metadata")) {
    const credentials = scopedRecords.flatMap((record) => record.evidencePackage.credentialMetadata);
    if (credentials.length > 0) payload.credentialMetadata = credentials;
  }

  const primary = records.find((record) => record.competencyId === primaryId);
  if (primary && fields.includes("competency_name")) {
    const competency = asRecord(payload.competency) ?? {};
    competency.competencyId = primary.competencyId;
    competency.name = primary.competencyName;
    if (fields.includes("competency_domain") && primary.domain) competency.domain = primary.domain;
    payload.competency = competency;
  }

  return payload;
}

async function loadLearnerDisclosureContext(userId: string): Promise<LearnerDisclosureContext> {
  const { data, error } = await db()
    .from("learner_profiles")
    .select("first_name, last_name, username, university_email, contact_number, institution_name, program, city_country, skills_summary, career_goal, avatar_url")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    return {
      displayName: null,
      institution: null,
      program: null,
      cityCountry: null,
      skillsSummary: null,
      careerGoal: null,
      email: null,
      phone: null,
      photoUrl: null,
    };
  }

  const row = data as Record<string, unknown>;
  const displayName = resolveLearnerDisplayName(row);
  return {
    displayName: displayName !== "Learner" ? displayName : null,
    institution: asNullableText(row.institution_name),
    program: asNullableText(row.program),
    cityCountry: asNullableText(row.city_country),
    skillsSummary: asNullableText(row.skills_summary),
    careerGoal: asNullableText(row.career_goal),
    email: asNullableText(row.university_email),
    phone: asNullableText(row.contact_number),
    photoUrl: await resolvePublicPhotoUrl(userId, asNullableText(row.avatar_url)),
  };
}

const PHOTO_EXTS = ["jpg", "jpeg", "png", "webp", "gif"] as const;

function avatarPathFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/profile-avatars\/(.+)$/);
    if (match?.[1]) return decodeURIComponent(match[1]);
  } catch {
    // stored value may already be a storage path
  }
  if (!url.includes("://") && url.includes("/")) return url.replace(/^\/+/, "");
  return null;
}

function candidateAvatarPaths(userId: string, storedUrl: string | null): string[] {
  const paths: string[] = [];
  const fromUrl = storedUrl ? avatarPathFromUrl(storedUrl) : null;
  if (fromUrl) paths.push(fromUrl);
  for (const ext of PHOTO_EXTS) {
    const candidate = `${userId}/avatar.${ext}`;
    if (!paths.includes(candidate)) paths.push(candidate);
  }
  return paths;
}

async function loadGithubAvatarUrl(userId: string): Promise<string | null> {
  const { data, error } = await getServiceSupabase()
    .from("github_connections")
    .select("github_avatar_url")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return asNullableText((data as Record<string, unknown>).github_avatar_url);
}

async function signAvatarPath(path: string): Promise<string | null> {
  const { data, error } = await getServiceSupabase()
    .storage
    .from("profile-avatars")
    .createSignedUrl(path, 60 * 60 * 24 * 14);
  return !error && data?.signedUrl ? data.signedUrl : null;
}

async function resolvePublicPhotoUrl(userId: string, storedUrl: string | null): Promise<string | null> {
  const { data: listed } = await getServiceSupabase()
    .storage
    .from("profile-avatars")
    .list(userId, { limit: 20 });
  const existing = (listed ?? []).map((file) => `${userId}/${file.name}`);
  for (const path of candidateAvatarPaths(userId, storedUrl)) {
    if (existing.includes(path)) {
      const signed = await signAvatarPath(path);
      if (signed) return signed;
    }
  }
  for (const path of existing) {
    if (!path.includes("/avatar.")) continue;
    const signed = await signAvatarPath(path);
    if (signed) return signed;
  }
  if (storedUrl) return storedUrl;
  return loadGithubAvatarUrl(userId);
}

async function downloadLearnerPhotoBytes(
  userId: string,
  storedUrl: string | null,
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const service = getServiceSupabase();
  for (const path of candidateAvatarPaths(userId, storedUrl)) {
    const { data, error } = await service.storage.from("profile-avatars").download(path);
    if (error || !data) continue;
    const bytes = new Uint8Array(await data.arrayBuffer());
    if (bytes.length === 0) continue;
    const contentType = data.type && data.type !== "application/octet-stream"
      ? data.type
      : guessImageType(path, bytes);
    return { bytes, contentType };
  }

  const fallbackUrl = storedUrl || await loadGithubAvatarUrl(userId);
  if (!fallbackUrl) return null;
  try {
    const response = await fetch(fallbackUrl);
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length === 0) return null;
    return {
      bytes,
      contentType: response.headers.get("content-type") || guessImageType(fallbackUrl, bytes),
    };
  } catch {
    return null;
  }
}

function guessImageType(path: string, bytes: Uint8Array): string {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return "image/gif";
  if (path.toLowerCase().includes(".png")) return "image/png";
  if (path.toLowerCase().includes(".webp")) return "image/webp";
  return "image/jpeg";
}

function learnerPhotoHidden(payload: Record<string, unknown>): boolean {
  const learner = payload.learner;
  return Boolean(learner && typeof learner === "object" && !Array.isArray(learner)
    && (learner as Record<string, unknown>).photoHidden === true);
}

async function loadLearnerPhotoUrl(userId: string): Promise<string | null> {
  const { data } = await getServiceSupabase()
    .from("learner_profiles")
    .select("avatar_url")
    .eq("user_id", userId)
    .maybeSingle();
  const storedUrl = asNullableText((data as Record<string, unknown> | null)?.avatar_url);
  return resolvePublicPhotoUrl(userId, storedUrl);
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

function dedupeRowsByKey<T extends DbRow>(
  items: T[],
  getKey: (item: T) => string,
): T[] {
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

function mergeLmsBuckets(
  primary: ReturnType<typeof aggregateLmsEvidenceForCompetency>,
  fromRecords: ReturnType<typeof buildLmsBundleFromEvidenceRecords>,
) {
  return {
    evidence: dedupeRowsByKey(
      [...fromRecords.evidence, ...primary.evidence],
      (row) => asText(row.id) || `${asText(row.course_name)}:${asText(row.assignment_name)}`,
    ),
    courses: dedupeRowsByKey(
      [...fromRecords.courses, ...primary.courses],
      (row) => asText(row.moodle_course_id) || asText(row.fullname),
    ),
    assignments: dedupeRowsByKey(
      [...fromRecords.assignments, ...primary.assignments],
      (row) => asText(row.moodle_assignment_id) || asText(row.name),
    ),
    grades: primary.grades,
    importedEvidence: primary.importedEvidence,
    teacherFeedback: dedupeRowsByKey(
      [...fromRecords.teacherFeedback, ...primary.teacherFeedback],
      (row) => `${asText(row.moodle_assignment_id)}:${asText(row.feedback_text).slice(0, 32)}`,
    ),
  };
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
        .select("id, mapped_skill_id, suggested_skill_id, source, repository_name, repository_url, language, commit_count, pr_summary, sync_date, status, external_id, description, metadata, last_updated")
        .eq("user_id", userId),
    ),
    safeFetchRows("lms_evidence", () =>
      db()
        .from("lms_evidence")
        .select("id, linked_skill_id, source, course_name, course_code, grade, completion_status, text_preview, fetched_at, evidence_hash, moodle_site_url")
        .eq("user_id", userId),
    ),
    safeFetchRows("moodle_courses", () =>
      db()
        .from("moodle_courses")
        .select("moodle_course_id, fullname, shortname, synced_at, moodle_site_url")
        .eq("user_id", userId),
    ),
    safeFetchRows("moodle_assignments", () =>
      db()
        .from("moodle_assignments")
        .select("moodle_course_id, moodle_assignment_id, name, module_type, submission_status, grade, grade_max, grade_formatted, graded_at, submitted_at, submission_text, competency_tags, feedback, synced_at, moodle_site_url")
        .eq("user_id", userId),
    ),
    safeFetchRows("moodle_grades", () =>
      db()
        .from("moodle_grades")
        .select("moodle_course_id, item_id, item_name, item_type, grade, grade_max, grade_formatted, synced_at, moodle_site_url")
        .eq("user_id", userId),
    ),
    safeFetchRows("moodle_feedback", () =>
      db()
        .from("moodle_feedback")
        .select("moodle_assignment_id, feedback_text, synced_at, moodle_site_url")
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

  const { github: githubEvidenceAll, lms: lmsEvidenceAll } = splitEvidenceRecordsBySource(evidenceRecords);
  const walletMatchLog: Array<{ skillName: string; matched: boolean }> = [];

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
      githubEvidenceAll.filter((row) =>
        asText(row.mapped_skill_id) === competencyId
        || asText(row.suggested_skill_id) === competencyId,
      ),
      (row) => asText(row.id) || asText(row.external_id),
    );

    const skillLmsEvidenceRecords = dedupeByKey(
      lmsEvidenceAll.filter((row) => asText(row.mapped_skill_id) === competencyId),
      (row) => asText(row.id) || asText(row.external_id),
    );
    walletMatchLog.push({
      skillName: competencyName,
      matched: skillLmsEvidenceRecords.length > 0,
    });

    const aggregatedLms = mergeLmsBuckets(
      aggregateLmsEvidenceForCompetency(competencyId, competencyName, {
        lmsEvidence,
        moodleCourses,
        moodleAssignments,
        moodleGrades,
        moodleFeedback,
        importedLmsEvidence: [],
        lmsEvidenceRecords: skillLmsEvidenceRecords,
      }),
      buildLmsBundleFromEvidenceRecords(lmsEvidenceAll, competencyId),
    );

    const skillLmsEvidence = sortByLatest(aggregatedLms.evidence, ["fetched_at"]);
    const skillImportedLmsEvidence = sortByLatest(aggregatedLms.importedEvidence, ["imported_at"]);
    const skillMoodleAssignments = sortByLatest(aggregatedLms.assignments, ["submitted_at", "graded_at", "synced_at"]);
    const skillMoodleCourses = sortByLatest(aggregatedLms.courses, ["synced_at"]);
    const skillMoodleGrades = sortByLatest(aggregatedLms.grades, ["synced_at"]);
    const skillTeacherFeedback = sortByLatest(aggregatedLms.teacherFeedback, ["reviewed_at"]);

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
        asText(row.source) !== "LMS"
        && !isLmsPeerReviewRow(row)
        && !githubReviews.some((review) => asText(review.id) === asText(row.id))
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

  logWalletLoad({
    declaredSkillCount: skillRows.length,
    lmsEvidenceCount: lmsEvidenceAll.length,
    matches: walletMatchLog,
  });

  return records
    .filter((record) => record.evidenceCount > 0 || record.taskResult || record.verificationStatus !== "Unverified")
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

function mapPresentationRow(row: DbRow): PresentationRow {
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

async function loadPresentationByToken(token: string): Promise<PresentationRow> {
  const tokenHash = generateSha256Hash(token);
  const clients = [getServiceSupabase(), getRequestSupabase()];
  for (const client of clients) {
    const { data, error } = await client
      .from("selective_disclosure_presentations")
      .select("*")
      .eq("share_token_hash", tokenHash)
      .maybeSingle();
    if (error) {
      if (env.NODE_ENV === "development") {
        console.warn("[wallet service] token lookup failed:", error.message);
      }
      continue;
    }
    const row = asRecord(data);
    if (row) return mapPresentationRow(row);
  }

  throw new AppError("Presentation not found", 404);
}

function isShareActive(row: PresentationRow, now = Date.now()): boolean {
  if (row.revoked_at) return false;
  if (row.expires_at && new Date(row.expires_at).getTime() <= now) return false;
  return true;
}

async function loadActiveShareForCompetency(
  userId: string,
  competencyId: string,
): Promise<PresentationRow | null> {
  const rows = await safeFetchRows("selective_disclosure_presentations", () =>
    db()
      .from("selective_disclosure_presentations")
      .select("*")
      .eq("learner_id", userId)
      .eq("competency_id", competencyId)
      .is("revoked_at", null)
      .order("created_at", { ascending: false }),
  );
  const active = rows
    .map((row) => mapPresentationRow(row))
    .filter((row) => isShareActive(row));
  return active[0] ?? null;
}

async function revokeDuplicateShares(
  userId: string,
  competencyId: string,
  keepId: string,
): Promise<void> {
  const rows = await safeFetchRows("selective_disclosure_presentations", () =>
    db()
      .from("selective_disclosure_presentations")
      .select("id, expires_at, revoked_at")
      .eq("learner_id", userId)
      .eq("competency_id", competencyId)
      .is("revoked_at", null),
  );
  const extras = rows
    .filter((row) => asText(row.id) !== keepId)
    .map((row) => asText(row.id))
    .filter(Boolean);
  if (extras.length === 0) return;
  await db()
    .from("selective_disclosure_presentations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("learner_id", userId)
    .eq("competency_id", competencyId)
    .in("id", extras);
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
    const records = await loadAggregatedWallet(userId);
    const record = records.find((item) => item.competencyId === competencyId);
    if (!record) throw new AppError("Competency wallet record not found", 404);
    await persistWalletRecord(record);
    const learnerContext = await loadLearnerDisclosureContext(userId);
    const shareScope = input.shareScope === "selected" ? "selected" : "all";
    const disclosedPayload = buildDisclosedPayload(
      record,
      input.selectedFields,
      learnerContext,
      shareScope === "all" ? records : [],
    );
    disclosedPayload.shareScope = shareScope;

    if (Object.keys(disclosedPayload).length === 0) {
      throw new AppError("Selected fields did not produce a shareable payload", 400);
    }

    const token = randomUUID();
    const tokenHash = generateSha256Hash(token);
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + (input.expiresInDays ?? 30) * 86_400_000).toISOString();
    const payloadHash = hashDisclosurePayload(disclosedPayload);
    const existing = await loadActiveShareForCompetency(userId, competencyId);
    const createdAt = existing?.created_at ?? now;
    const proof = buildSelectiveDisclosureProof({
      learnerDid: record.learnerDid,
      competencyId,
      learnerId: userId,
      payloadHash,
      createdAt,
      expiresAt,
    });

    const shareRow = {
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
      revoked_at: null,
      updated_at: now,
    };

    const { data, error } = existing
      ? await db()
        .from("selective_disclosure_presentations")
        .update(shareRow)
        .eq("id", existing.id)
        .eq("learner_id", userId)
        .select("id, expires_at")
        .single()
      : await db()
        .from("selective_disclosure_presentations")
        .insert({ ...shareRow, created_at: now })
        .select("id, expires_at")
        .single();

    if (error) {
      throwDbError(error, "Could not create share link");
    }

    if (existing) {
      await revokeDuplicateShares(userId, competencyId, asText((data as DbRow).id));
    }

    return {
      shareId: asText((data as DbRow).id),
      shareUrl: `${env.FRONTEND_URL.replace(/\/$/, "")}/credential/${encodeURIComponent(token)}`,
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

    if (error) throwDbError(error, "Could not revoke share link");
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

  async getPublicCredential(token: string): Promise<PublicCredentialResponse> {
    const row = await loadPresentationByToken(token);
    return await this.toPublicCredential(token, row);
  }

  async getPublicResumePhoto(token: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
    const row = await loadPresentationByToken(token);
    if (row.revoked_at || (row.expires_at && new Date(row.expires_at).getTime() < Date.now())) {
      return null;
    }
    if (learnerPhotoHidden(row.disclosed_payload)) return null;
    const storedUrl = asNullableText(
      (row.disclosed_payload.learner && typeof row.disclosed_payload.learner === "object"
        ? (row.disclosed_payload.learner as Record<string, unknown>).photoUrl
        : null),
    );
    return downloadLearnerPhotoBytes(row.learner_id, storedUrl);
  }

  async getPublicCompetency(token: string, competencyId: string): Promise<PublicCompetencyResponse> {
    const row = await loadPresentationByToken(token);
    const verification = buildVerificationResult({
      row,
      disclosedPayload: row.disclosed_payload,
    });
    const verifiedAt = new Date().toISOString();

    if (verification.revoked) {
      return {
        status: "revoked",
        verified: false,
        verifiedAt,
        competency: null,
        ledger: null,
      };
    }
    if (verification.expired) {
      return {
        status: "expired",
        verified: false,
        verifiedAt,
        competency: null,
        ledger: null,
      };
    }
    const payload = await hydrateSharedWalletPayload(row);
    const competency = competencyFromSharePayload(
      payload,
      competencyId,
      row.competency_id,
    );
    if (!competency) {
      throw new AppError("This competency was not included in the share", 404);
    }

    return {
      status: "valid",
      verified: verification.result === "Valid Proof",
      verifiedAt,
      competency,
      ledger: buildEvidenceLedger(payload, competencyId, row.selected_fields),
    };
  }

  async getOwnerWalletResume(userId: string): Promise<{
    resume: PublicCredentialResponse["resume"];
    resumeText: string | null;
    competencyCount: number;
  }> {
    const records = await loadAggregatedWallet(userId);
    if (records.length === 0) {
      throw new AppError("No competency records to export", 404);
    }

    const learnerContext = await loadLearnerDisclosureContext(userId);
    const allFields = [...WALLET_SHARE_FIELD_IDS];
    const primary = records[0];
    const payload = buildDisclosedPayload(primary, allFields, learnerContext, records);

    const skills = records
      .filter((record) => record.competencyName.trim())
      .map((record) => ({
        competencyId: record.competencyId,
        name: record.competencyName,
        domain: record.domain,
        primary: record.competencyId === primary.competencyId,
        evidenceBacked: record.evidenceCount > 0,
        evidence: buildSkillEvidenceSlice(record, allFields),
      }));
    payload.skills = skills;

    const evidence = (payload.evidence && typeof payload.evidence === "object" && !Array.isArray(payload.evidence))
      ? payload.evidence as Record<string, unknown>
      : {};
    const githubRepos = records.flatMap((record) => record.evidencePackage.github.repos);
    const lmsCourses = records.flatMap((record) => record.evidencePackage.lms.courses);
    const lmsAssignments = records.flatMap((record) => record.evidencePackage.lms.assignments);
    const credentials = records.flatMap((record) => record.evidencePackage.credentialMetadata);
    evidence.github = {
      ...((evidence.github && typeof evidence.github === "object") ? evidence.github as Record<string, unknown> : {}),
      repos: githubRepos,
    };
    evidence.lms = {
      ...((evidence.lms && typeof evidence.lms === "object") ? evidence.lms as Record<string, unknown> : {}),
      courses: lmsCourses,
      assignments: lmsAssignments,
    };
    payload.evidence = evidence;
    if (credentials.length > 0) payload.credentialMetadata = credentials;
    if (learnerContext.photoUrl) {
      const learner = (payload.learner && typeof payload.learner === "object")
        ? payload.learner as Record<string, unknown>
        : {};
      learner.photoUrl = learnerContext.photoUrl;
      payload.learner = learner;
    }

    const resume = buildAtsResume(payload, "wallet", primary.competencyId);
    return {
      resume,
      resumeText: atsResumeToPlainText(resume),
      competencyCount: records.length,
    };
  }

  async getOwnerShareExport(userId: string, shareId: string): Promise<{
    status: PublicCredentialResponse["status"];
    resume: PublicCredentialResponse["resume"];
    resumeText: string | null;
    shareId: string;
  }> {
    const row = await loadPresentationByShareId(userId, shareId);
    const resolved = await this.toPublicCredential("owner", row);
    return {
      status: resolved.status,
      resume: resolved.resume,
      resumeText: resolved.resume ? atsResumeToPlainText(resolved.resume) : null,
      shareId: row.id,
    };
  }

  async getOwnerSharePresentation(userId: string, shareId: string): Promise<PresentationRow> {
    return loadPresentationByShareId(userId, shareId);
  }

  private async toPublicCredential(token: string, row: PresentationRow): Promise<PublicCredentialResponse> {
    const verification = buildVerificationResult({
      row,
      disclosedPayload: row.disclosed_payload,
    });
    const verifiedAt = new Date().toISOString();
    const walletExport = walletExportAvailability();

    if (verification.revoked) {
      return {
        status: "revoked",
        verified: false,
        verifiedAt,
        competencyId: row.competency_id,
        selectedFields: row.selected_fields,
        selectionMode: row.selection_mode,
        resume: null,
        webView: null,
        walletExport,
      };
    }
    if (verification.expired) {
      return {
        status: "expired",
        verified: false,
        verifiedAt,
        competencyId: row.competency_id,
        selectedFields: row.selected_fields,
        selectionMode: row.selection_mode,
        resume: null,
        webView: null,
        walletExport,
      };
    }

    const resumeToken = token === "owner" ? row.id : token;
    const payload = await hydrateSharedWalletPayload(row);
    const resume = buildAtsResume(payload, resumeToken, row.competency_id, row.selected_fields);
    if (resume) {
      if (learnerPhotoHidden(payload)) {
        resume.photoUrl = undefined;
      } else {
        const photoUrl = await loadLearnerPhotoUrl(row.learner_id);
        if (photoUrl) resume.photoUrl = photoUrl;
      }
    }
    return {
      status: verification.result === "Valid Proof" ? "valid" : "valid",
      verified: verification.result === "Valid Proof",
      verifiedAt,
      competencyId: row.competency_id,
      selectedFields: row.selected_fields,
      selectionMode: row.selection_mode,
      resume,
      webView: {
        disclosedPayload: payload,
        proofType: row.proof_type || "SignedSelectiveDisclosure",
        verificationMethod: row.verification_method,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        payloadHash: row.payload_hash,
      },
      walletExport,
    };
  }
}

async function loadPresentationByShareId(userId: string, shareId: string): Promise<PresentationRow> {
  const row = await safeFetchSingle("selective_disclosure_presentations", () =>
    db()
      .from("selective_disclosure_presentations")
      .select("*")
      .eq("id", shareId)
      .eq("learner_id", userId)
      .maybeSingle(),
  );

  if (!row) throw new AppError("Presentation not found", 404);

  return mapPresentationRow(row);
}

export const walletService = new WalletService();
