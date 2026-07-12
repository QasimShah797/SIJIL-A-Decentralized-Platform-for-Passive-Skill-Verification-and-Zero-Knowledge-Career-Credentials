export const WALLET_SOURCE_BADGES = [
  "GitHub",
  "LMS",
  "Practical Task",
  "Reviews",
] as const;

export type WalletSourceBadge = (typeof WALLET_SOURCE_BADGES)[number];

export const WALLET_RECORD_STATUSES = [
  "Evidence Collected",
  "Submitted",
  "Passed",
  "Needs Improvement",
  "Timed Out",
  "Review Available",
] as const;

export type WalletRecordStatus = (typeof WALLET_RECORD_STATUSES)[number];

export type WalletPracticalTaskStatus =
  | "Submitted"
  | "Passed"
  | "Needs Improvement"
  | "Timed Out";

export type WalletAttemptHistoryItem = {
  attemptId: string;
  title: string;
  status: WalletPracticalTaskStatus;
  submittedAt: string | null;
  scorePercent: number | null;
  correctCount: number | null;
  totalQuestions: number | null;
  passed: boolean;
};

export type WalletEvidenceSummary = {
  competency: {
    id: string;
    name: string;
    domain: string;
    description: string;
  };
  learner: {
    id: string;
    did: string | null;
  };
  github: {
    repos: Record<string, unknown>[];
    activities: Record<string, unknown>[];
    evidenceRecords: Record<string, unknown>[];
    reviews: Record<string, unknown>[];
  };
  lms: {
    evidence: Record<string, unknown>[];
    courses: Record<string, unknown>[];
    assignments: Record<string, unknown>[];
    grades: Record<string, unknown>[];
    importedEvidence: Record<string, unknown>[];
  };
  practicalTask: {
    latestAttempt: WalletAttemptHistoryItem | null;
    attemptHistory: WalletAttemptHistoryItem[];
  };
  peerReviews: Record<string, unknown>[];
  teacherFeedback: Record<string, unknown>[];
  institutionReview: {
    status: string | null;
    feedback: string | null;
    reviewedAt: string | null;
  };
  evidenceTimestamps: {
    github: string[];
    lms: string[];
    practicalTask: string[];
    peerReviews: string[];
    teacherFeedback: string[];
  };
  sourceBadges: WalletSourceBadge[];
  evidenceCount: number;
};

function hasItems(list: Record<string, unknown>[]): boolean {
  return list.length > 0;
}

function uniqueTimestamps(list: Array<string | null | undefined>): string[] {
  return [...new Set(list.filter((value): value is string => Boolean(value)))].sort((a, b) => (
    new Date(b).getTime() - new Date(a).getTime()
  ));
}

export function deriveWalletPracticalTaskStatus(params: {
  passed?: boolean | null;
  scorePercent?: number | null;
  status?: string | null;
}): WalletPracticalTaskStatus {
  if (params.status === "timed_out" || params.status === "auto_submitted") return "Timed Out";
  if (params.passed) return "Passed";
  if (params.scorePercent != null) return "Needs Improvement";
  return "Submitted";
}

export function deriveWalletRecordStatus(params: {
  githubCount: number;
  lmsCount: number;
  practicalTaskStatus: WalletPracticalTaskStatus | null;
  peerReviewCount: number;
}): WalletRecordStatus {
  if (params.peerReviewCount > 0) return "Review Available";
  if (params.practicalTaskStatus === "Passed") return "Passed";
  if (params.practicalTaskStatus === "Needs Improvement") return "Needs Improvement";
  if (params.practicalTaskStatus === "Timed Out") return "Timed Out";
  if (params.practicalTaskStatus === "Submitted") return "Submitted";
  return params.githubCount > 0 || params.lmsCount > 0
    ? "Evidence Collected"
    : "Evidence Collected";
}

export function deriveWalletSourceBadges(params: {
  github: Record<string, unknown>[];
  lms: Record<string, unknown>[];
  practicalTasks: WalletAttemptHistoryItem[];
  reviews: Record<string, unknown>[];
}): WalletSourceBadge[] {
  const badges: WalletSourceBadge[] = [];
  if (hasItems(params.github)) badges.push("GitHub");
  if (hasItems(params.lms)) badges.push("LMS");
  if (params.practicalTasks.length > 0) badges.push("Practical Task");
  if (hasItems(params.reviews)) badges.push("Reviews");
  return badges;
}

export function countWalletEvidence(params: {
  github: {
    repos: Record<string, unknown>[];
    activities: Record<string, unknown>[];
    evidenceRecords: Record<string, unknown>[];
    reviews: Record<string, unknown>[];
  };
  lms: {
    evidence: Record<string, unknown>[];
    courses: Record<string, unknown>[];
    assignments: Record<string, unknown>[];
    grades: Record<string, unknown>[];
    importedEvidence: Record<string, unknown>[];
  };
  practicalTasks: WalletAttemptHistoryItem[];
  peerReviews: Record<string, unknown>[];
  teacherFeedback: Record<string, unknown>[];
}): number {
  return (
    params.github.repos.length
    + params.github.activities.length
    + params.github.evidenceRecords.length
    + params.github.reviews.length
    + params.lms.evidence.length
    + params.lms.courses.length
    + params.lms.assignments.length
    + params.lms.grades.length
    + params.lms.importedEvidence.length
    + params.practicalTasks.length
    + params.peerReviews.length
    + params.teacherFeedback.length
  );
}

export function buildWalletEvidenceSummary(params: {
  competencyId: string;
  competencyName: string;
  competencyDomain: string;
  competencyDescription: string;
  learnerId: string;
  learnerDid: string | null;
  github: WalletEvidenceSummary["github"];
  lms: WalletEvidenceSummary["lms"];
  practicalTasks: WalletAttemptHistoryItem[];
  peerReviews: Record<string, unknown>[];
  teacherFeedback: Record<string, unknown>[];
  institutionReview: WalletEvidenceSummary["institutionReview"];
  timestampGroups: {
    github: Array<string | null | undefined>;
    lms: Array<string | null | undefined>;
    practicalTask: Array<string | null | undefined>;
    peerReviews: Array<string | null | undefined>;
    teacherFeedback: Array<string | null | undefined>;
  };
}): WalletEvidenceSummary {
  const latestAttempt = params.practicalTasks[0] ?? null;
  const practicalTaskStatus = latestAttempt?.status ?? null;
  const sourceBadges = deriveWalletSourceBadges({
    github: [
      ...params.github.repos,
      ...params.github.activities,
      ...params.github.evidenceRecords,
      ...params.github.reviews,
    ],
    lms: [
      ...params.lms.evidence,
      ...params.lms.courses,
      ...params.lms.assignments,
      ...params.lms.grades,
      ...params.lms.importedEvidence,
    ],
    practicalTasks: params.practicalTasks,
    reviews: [...params.peerReviews, ...params.teacherFeedback],
  });

  return {
    competency: {
      id: params.competencyId,
      name: params.competencyName,
      domain: params.competencyDomain,
      description: params.competencyDescription,
    },
    learner: {
      id: params.learnerId,
      did: params.learnerDid,
    },
    github: params.github,
    lms: params.lms,
    practicalTask: {
      latestAttempt,
      attemptHistory: params.practicalTasks,
    },
    peerReviews: params.peerReviews,
    teacherFeedback: params.teacherFeedback,
    institutionReview: params.institutionReview,
    evidenceTimestamps: {
      github: uniqueTimestamps(params.timestampGroups.github),
      lms: uniqueTimestamps(params.timestampGroups.lms),
      practicalTask: uniqueTimestamps(params.timestampGroups.practicalTask),
      peerReviews: uniqueTimestamps(params.timestampGroups.peerReviews),
      teacherFeedback: uniqueTimestamps(params.timestampGroups.teacherFeedback),
    },
    sourceBadges,
    evidenceCount: countWalletEvidence({
      github: params.github,
      lms: params.lms,
      practicalTasks: params.practicalTasks,
      peerReviews: params.peerReviews,
      teacherFeedback: params.teacherFeedback,
    }),
  };
}
