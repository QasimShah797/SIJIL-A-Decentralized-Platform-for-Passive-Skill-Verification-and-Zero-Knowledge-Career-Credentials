/**
 * Safe evidence summaries for "Share details" mode.
 * Never includes exact scores, full commit lists, grades, or individual review text.
 *
 * Evidence cards / modes are gated by per-competency linked evidence only.
 */
import type { WalletCompetencyRecordView } from "../types/wallet.types";
import { AppError } from "../utils/AppError";

export type EvidenceShareMode = "details" | "private" | "omit";

export type EvidenceModes = {
  practical_task_result: EvidenceShareMode;
  github_evidence: EvidenceShareMode;
  lms_evidence: EvidenceShareMode;
  peer_reviews: EvidenceShareMode;
};

export const DEFAULT_EVIDENCE_MODES: EvidenceModes = {
  practical_task_result: "omit",
  github_evidence: "omit",
  lms_evidence: "omit",
  peer_reviews: "omit",
};

export const EVIDENCE_MODE_FIELDS = [
  "practical_task_result",
  "github_evidence",
  "lms_evidence",
  "peer_reviews",
] as const satisfies ReadonlyArray<keyof EvidenceModes>;

export type EvidenceFieldAvailability = {
  present: boolean;
  privateAllowed: boolean;
  /** Learner-facing reason when private ZKP cannot be offered. */
  privateBlockedReason: string | null;
};

export type EvidenceShareAvailability = Record<keyof EvidenceModes, EvidenceFieldAvailability>;

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function peerReviewCandidates(record: WalletCompetencyRecordView): unknown[] {
  const peers = asList(record.evidencePackage.peerReviews);
  const githubReviews = asList(record.evidencePackage.github?.reviews);
  const out: unknown[] = [...peers];
  for (const item of githubReviews) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const origin = String(row.origin ?? "").toLowerCase();
    const role = String(row.reviewer_role ?? "").toLowerCase();
    const hasHumanFeedback = Boolean(row.review_text || row.comment || row.recommendation || row.decision);
    if (origin.includes("form review") || origin.includes("sijil") || role.includes("collaborator") || hasHumanFeedback) {
      out.push(item);
    }
  }
  return out;
}

/** Linked evidence for the selected competency only (never another skill). */
export function assessEvidenceShareAvailability(
  record: WalletCompetencyRecordView,
): EvidenceShareAvailability {
  const latest = record.evidencePackage.practicalTask?.latestAttempt
    ?? record.evidencePackage.practicalTask?.attemptHistory?.[0]
    ?? null;
  const practicalPresent = Boolean(latest);
  const practicalPrivate = practicalPresent && (
    latest?.passed === true
    || (typeof latest?.scorePercent === "number" && Number.isFinite(latest.scorePercent))
    || String(latest?.status ?? "").toLowerCase().includes("pass")
  );

  const repos = asList(record.evidencePackage.github?.repos);
  const activities = asList(record.evidencePackage.github?.activities);
  const githubEvidenceRecords = asList(record.evidencePackage.github?.evidenceRecords);
  const githubPresent = repos.length > 0 || activities.length > 0 || githubEvidenceRecords.length > 0;
  const githubPrivate = repos.length > 0;

  const courses = asList(record.evidencePackage.lms?.courses);
  const assignments = asList(record.evidencePackage.lms?.assignments);
  const lmsEvidence = asList(record.evidencePackage.lms?.evidence);
  const lmsPresent = courses.length > 0 || assignments.length > 0 || lmsEvidence.length > 0;
  const lmsPrivate = assignments.length > 0;

  const peers = peerReviewCandidates(record);
  const peerPresent = peers.length > 0;

  return {
    practical_task_result: {
      present: practicalPresent,
      privateAllowed: practicalPrivate,
      privateBlockedReason: practicalPresent && !practicalPrivate
        ? "Private verification needs a completed practical result for this credential."
        : null,
    },
    github_evidence: {
      present: githubPresent,
      privateAllowed: githubPrivate,
      privateBlockedReason: githubPresent && !githubPrivate
        ? "Private verification needs a repository linked to this credential."
        : null,
    },
    lms_evidence: {
      present: lmsPresent,
      privateAllowed: lmsPrivate,
      privateBlockedReason: lmsPresent && !lmsPrivate
        ? "Private verification needs Moodle assignments linked to this credential."
        : null,
    },
    peer_reviews: {
      present: peerPresent,
      privateAllowed: peerPresent,
      privateBlockedReason: null,
    },
  };
}

/**
 * Force omit for evidence not linked to this credential.
 * Coerce private → details when evidence exists but private ZKP cannot be offered.
 */
export function sanitizeEvidenceModesForRecord(
  input: Partial<EvidenceModes> | null | undefined,
  record: WalletCompetencyRecordView,
): EvidenceModes {
  const availability = assessEvidenceShareAvailability(record);
  const merged: EvidenceModes = {
    ...DEFAULT_EVIDENCE_MODES,
    ...(input ?? {}),
  };
  const next = { ...merged };
  for (const field of EVIDENCE_MODE_FIELDS) {
    const avail = availability[field];
    if (!avail.present) {
      next[field] = "omit";
      continue;
    }
    if (next[field] === "private" && !avail.privateAllowed) {
      next[field] = "details";
    }
  }
  return next;
}

/** Reject client attempts to share evidence not linked to the selected credential. */
export function assertEvidenceModesAllowed(
  requested: Partial<EvidenceModes> | null | undefined,
  record: WalletCompetencyRecordView,
): void {
  if (!requested) return;
  const availability = assessEvidenceShareAvailability(record);
  for (const field of EVIDENCE_MODE_FIELDS) {
    const mode = requested[field];
    if (!mode || mode === "omit") continue;
    const avail = availability[field];
    if (!avail.present) {
      throw new AppError(
        `Cannot share ${field.replace(/_/g, " ")}: no evidence is linked to this credential.`,
        400,
      );
    }
    if (mode === "private" && !avail.privateAllowed) {
      throw new AppError(
        avail.privateBlockedReason
          ?? `Private verification is not available for ${field.replace(/_/g, " ")}.`,
        400,
      );
    }
  }
}

/**
 * Build the field list that may enter the frozen disclosed payload.
 * Identity/timestamp fields pass through; evidence fields are included only for
 * "details" mode. Private/omit never contribute exact evidence fields.
 */
export function resolveShareFieldsForModes(
  selectedFields: string[],
  evidenceModes: EvidenceModes,
): string[] {
  const evidenceSet = new Set<string>(EVIDENCE_MODE_FIELDS);
  const nonEvidence = selectedFields.filter((field) => !evidenceSet.has(field));
  const detailEvidence = EVIDENCE_MODE_FIELDS.filter((field) => evidenceModes[field] === "details");
  return [...nonEvidence, ...detailEvidence];
}

export function summarizePracticalDetails(record: WalletCompetencyRecordView): Record<string, unknown> | undefined {
  const latest = record.evidencePackage.practicalTask.latestAttempt;
  if (!latest) return undefined;
  return {
    status: latest.status,
    submittedAt: latest.submittedAt,
    passed: latest.passed,
    // Explicitly omit scorePercent / correctCount / totalQuestions
    scoreHidden: true,
  };
}

export function summarizeGithubDetails(record: WalletCompetencyRecordView): Record<string, unknown> | undefined {
  const repos = record.evidencePackage.github.repos ?? [];
  if (!Array.isArray(repos) || repos.length === 0) {
    const activities = record.evidencePackage.github.activities ?? [];
    if (!Array.isArray(activities) || activities.length === 0) return undefined;
    return {
      repositoryCount: 0,
      activityCount: activities.length,
      activityRecordsShared: false,
      repos: [],
      summary: "GitHub activity on file",
    };
  }
  // Safe details for "Share details" / activity-count mode: repo identity only.
  // Exact commit counts stay under disclosure-preference redaction if ever present.
  const safeRepos = repos.map((repo) => {
    const row = repo && typeof repo === "object" ? repo as Record<string, unknown> : {};
    return {
      full_name: typeof row.full_name === "string" ? row.full_name : null,
      repo_name: typeof row.repo_name === "string" ? row.repo_name : null,
      primary_language: typeof row.primary_language === "string"
        ? row.primary_language
        : (typeof row.language === "string" ? row.language : null),
      github_url: typeof row.github_url === "string" ? row.github_url : null,
    };
  }).filter((row) => row.full_name || row.repo_name);
  return {
    repositoryCount: safeRepos.length,
    activityCount: safeRepos.length,
    activityRecordsShared: false,
    repos: safeRepos,
    summary: `${safeRepos.length} linked ${safeRepos.length === 1 ? "repository" : "repositories"}`,
  };
}

export function summarizeLmsDetails(record: WalletCompetencyRecordView): Record<string, unknown> | undefined {
  const courses = record.evidencePackage.lms.courses ?? [];
  const assignments = record.evidencePackage.lms.assignments ?? [];
  if ((!Array.isArray(courses) || courses.length === 0) && (!Array.isArray(assignments) || assignments.length === 0)) {
    return undefined;
  }
  return {
    courseCount: Array.isArray(courses) ? courses.length : 0,
    assignmentCount: Array.isArray(assignments) ? assignments.length : 0,
    gradesShared: false,
    summary: "Moodle learning overview",
  };
}

export function summarizePeerDetails(record: WalletCompetencyRecordView): Record<string, unknown> | undefined {
  const reviews = record.evidencePackage.peerReviews;
  const list = Array.isArray(reviews) ? reviews : [];
  if (list.length === 0) return undefined;
  return {
    reviewCountDisclosed: false,
    feedbackShared: false,
    summary: "Peer reviews on file",
  };
}

export type PrivateResultView = {
  claimType: "practical_assessment" | "github_activity" | "moodle_learning" | "peer_review";
  status: "preparing" | "confirmed" | "failed" | "unmet" | "unavailable";
  label: string;
  detailHidden: string;
  policyId: string;
  circuitId: string | null;
  verifiedBy: "sijil" | null;
};

export function privateResultPlaceholder(
  claimType: PrivateResultView["claimType"],
  status: PrivateResultView["status"],
  policyId: string,
  circuitId: string | null,
): PrivateResultView {
  const labels: Record<PrivateResultView["claimType"], { met: string; hide: string }> = {
    practical_assessment: { met: "Requirement met", hide: "Score hidden" },
    github_activity: { met: "Requirement met", hide: "Count hidden" },
    moodle_learning: { met: "Requirement met", hide: "Progress hidden" },
    peer_review: { met: "Requirement met", hide: "Review details hidden" },
  };
  const copy = labels[claimType];
  if (status === "confirmed") {
    return { claimType, status, label: copy.met, detailHidden: copy.hide, policyId, circuitId, verifiedBy: "sijil" };
  }
  if (status === "preparing") {
    return { claimType, status, label: "Preparing result…", detailHidden: copy.hide, policyId, circuitId, verifiedBy: null };
  }
  if (status === "unmet") {
    return { claimType, status, label: "Requirement not met", detailHidden: copy.hide, policyId, circuitId, verifiedBy: "sijil" };
  }
  if (status === "unavailable") {
    return { claimType, status, label: "Could not confirm", detailHidden: copy.hide, policyId, circuitId, verifiedBy: null };
  }
  return { claimType, status: "failed", label: "Could not confirm", detailHidden: copy.hide, policyId, circuitId, verifiedBy: null };
}
