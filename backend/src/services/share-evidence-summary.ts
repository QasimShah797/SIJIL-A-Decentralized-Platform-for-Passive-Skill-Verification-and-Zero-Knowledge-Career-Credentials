/**
 * Safe evidence summaries for "Share details" mode.
 * Never includes exact scores, full commit lists, grades, or individual review text.
 */
import type { WalletCompetencyRecordView } from "../types/wallet.types";

export type EvidenceShareMode = "details" | "private" | "omit";

export type EvidenceModes = {
  practical_task_result: EvidenceShareMode;
  github_evidence: EvidenceShareMode;
  lms_evidence: EvidenceShareMode;
  peer_reviews: EvidenceShareMode;
};

export const DEFAULT_EVIDENCE_MODES: EvidenceModes = {
  practical_task_result: "private",
  github_evidence: "private",
  lms_evidence: "private",
  peer_reviews: "private",
};

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
    return { repositoryCount: 0, activityRecordsShared: false, summary: "GitHub activity on file" };
  }
  return {
    repositoryCount: repos.length,
    activityRecordsShared: false,
    summary: `${repos.length} linked ${repos.length === 1 ? "repository" : "repositories"}`,
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
