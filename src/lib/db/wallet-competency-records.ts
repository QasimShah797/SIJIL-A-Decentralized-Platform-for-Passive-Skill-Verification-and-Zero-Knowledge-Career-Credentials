import { supabase } from "@/integrations/supabase/client";
import {
  buildWalletEvidenceSummary,
  countWalletEvidence,
  deriveWalletPracticalTaskStatus,
  deriveWalletRecordStatus,
  deriveWalletSourceBadges,
  type WalletAttemptHistoryItem,
  type WalletEvidenceSummary,
  type WalletPracticalTaskStatus,
  type WalletRecordStatus,
  type WalletSourceBadge,
} from "@/lib/wallet-competency-shared";
import { parseMcqSession } from "@/lib/mcq-tasks";
import { isMissingColumnError } from "@/lib/supabase-errors";
import {
  aggregateLmsEvidenceForCompetency,
  isLmsPeerReviewRow,
} from "@/lib/moodle-evidence-matching";
import {
  buildLmsBundleFromEvidenceRecords,
  logWalletLoad,
  splitEvidenceRecordsBySource,
} from "@/lib/wallet-evidence-mapping";

type WalletCompetencyRecordRow = {
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

export type WalletCompetencyRecordView = {
  id: string;
  learnerId: string;
  competencyId: string;
  competencyName: string;
  domain: string;
  description: string;
  learnerDid: string | null;
  learnerIdentityReference?: string | null;
  status: WalletRecordStatus | string;
  practicalTaskStatus: WalletPracticalTaskStatus | string | null;
  taskResult: WalletPracticalTaskStatus | string | null;
  verificationStatus?: string;
  walletRecordStatus?: string;
  evidenceCount: number;
  sourceBadges: WalletSourceBadge[];
  createdAt: string;
  updatedAt: string;
  evidencePackage: WalletEvidenceSummary;
};

function asUntypedClient() {
  return supabase as unknown as {
    from: (table: string) => {
      select: (columns?: string) => any;
    };
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
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

function competencyMatches(value: unknown, competencyName: string): boolean {
  const left = normalizedText(value);
  const right = normalizedText(competencyName);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function sortByLatest<T extends Record<string, unknown>>(rows: T[], fields: string[]): T[] {
  const timeFor = (row: T) => {
    for (const field of fields) {
      const value = row[field];
      if (typeof value === "string" && value) {
        const time = new Date(value).getTime();
        if (Number.isFinite(time)) return time;
      }
    }
    return 0;
  };

  return [...rows].sort((a, b) => timeFor(b) - timeFor(a));
}

function sortStringsByLatest(list: Array<string | null | undefined>): string[] {
  return [...new Set(list.filter((item): item is string => Boolean(item)))]
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
}

function asAttemptHistory(value: unknown): WalletAttemptHistoryItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const row = asRecord(item);
      if (!row) return null;
      return {
        attemptId: asText(row.attemptId),
        title: asText(row.title) || "Practical task",
        status: (asText(row.status) || "Task Submitted") as WalletPracticalTaskStatus,
        submittedAt: asNullableText(row.submittedAt),
        scorePercent: typeof row.scorePercent === "number" ? row.scorePercent : null,
        correctCount: typeof row.correctCount === "number" ? row.correctCount : null,
        totalQuestions: typeof row.totalQuestions === "number" ? row.totalQuestions : null,
        passed: row.passed === true,
      };
    })
    .filter((item): item is WalletAttemptHistoryItem => item !== null);
}

function normalizeSummary(
  row: WalletCompetencyRecordRow,
): WalletEvidenceSummary {
  const raw = asRecord(row.evidence_summary) ?? {};
  const competency = asRecord(raw.competency);
  const learner = asRecord(raw.learner);
  const github = asRecord(raw.github);
  const lms = asRecord(raw.lms);
  const practicalTask = asRecord(raw.practicalTask);
  const institutionReview = asRecord(raw.institutionReview);
  const evidenceTimestamps = asRecord(raw.evidenceTimestamps);
  const status = asRecord(raw.status);
  const metadata = asRecord(raw.metadata);

  const summary: WalletEvidenceSummary = {
    competency: {
      id: asText(competency?.id) || row.competency_id,
      name: asText(competency?.name) || row.competency_name,
      domain: asText(competency?.domain) || "General",
      description: asText(competency?.description),
    },
    learner: {
      id: asText(learner?.id) || row.learner_id,
      did: asNullableText(learner?.did),
      identityReference: asNullableText(learner?.identityReference),
    },
    github: {
      repos: asArray(github?.repos),
      activities: asArray(github?.activities),
      evidenceRecords: asArray(github?.evidenceRecords),
      reviews: asArray(github?.reviews),
    },
    lms: {
      evidence: asArray(lms?.evidence),
      courses: asArray(lms?.courses),
      assignments: asArray(lms?.assignments),
      grades: asArray(lms?.grades),
      importedEvidence: asArray(lms?.importedEvidence),
    },
    practicalTask: {
      latestAttempt: asRecord(practicalTask?.latestAttempt)
        ? asAttemptHistory([practicalTask?.latestAttempt])[0] ?? null
        : null,
      attemptHistory: asAttemptHistory(practicalTask?.attemptHistory),
    },
    peerReviews: asArray(raw.peerReviews),
    teacherFeedback: asArray(raw.teacherFeedback),
    externalEvidence: asArray(raw.externalEvidence),
    institutionReview: {
      status: asNullableText(institutionReview?.status),
      feedback: asNullableText(institutionReview?.feedback),
      reviewedAt: asNullableText(institutionReview?.reviewedAt),
    },
    credentialMetadata: asArray(raw.credentialMetadata),
    evidenceTimestamps: {
      github: Array.isArray(evidenceTimestamps?.github) ? evidenceTimestamps.github.filter((item): item is string => typeof item === "string") : [],
      lms: Array.isArray(evidenceTimestamps?.lms) ? evidenceTimestamps.lms.filter((item): item is string => typeof item === "string") : [],
      practicalTask: Array.isArray(evidenceTimestamps?.practicalTask) ? evidenceTimestamps.practicalTask.filter((item): item is string => typeof item === "string") : [],
      peerReviews: Array.isArray(evidenceTimestamps?.peerReviews) ? evidenceTimestamps.peerReviews.filter((item): item is string => typeof item === "string") : [],
      teacherFeedback: Array.isArray(evidenceTimestamps?.teacherFeedback) ? evidenceTimestamps.teacherFeedback.filter((item): item is string => typeof item === "string") : [],
      externalEvidence: Array.isArray(evidenceTimestamps?.externalEvidence) ? evidenceTimestamps.externalEvidence.filter((item): item is string => typeof item === "string") : [],
    },
    sourceBadges: [],
    evidenceCount: 0,
    status: {
      taskStatus: (asNullableText(status?.taskStatus) as WalletPracticalTaskStatus | null) ?? null,
      reviewStatus: asText(status?.reviewStatus) || "Pending Review",
      verificationStatus: asText(status?.verificationStatus) || "Unverified",
      walletStatus: (asText(status?.walletStatus) || row.status) as WalletRecordStatus,
    },
    metadata: {
      createdAt: asText(metadata?.createdAt) || row.created_at,
      updatedAt: asText(metadata?.updatedAt) || row.updated_at,
      evidenceCount: asNumber(metadata?.evidenceCount) ?? 0,
      sourceMetadata: Array.isArray(metadata?.sourceMetadata)
        ? metadata.sourceMetadata.filter((item): item is string => typeof item === "string")
        : [],
      evidenceHashes: Array.isArray(metadata?.evidenceHashes)
        ? metadata.evidenceHashes.filter((item): item is string => typeof item === "string")
        : [],
    },
  };

  summary.sourceBadges = deriveWalletSourceBadges({
    github: [
      ...summary.github.repos,
      ...summary.github.activities,
      ...summary.github.evidenceRecords,
      ...summary.github.reviews,
    ],
    lms: [
      ...summary.lms.evidence,
      ...summary.lms.courses,
      ...summary.lms.assignments,
      ...summary.lms.grades,
      ...summary.lms.importedEvidence,
    ],
    practicalTasks: summary.practicalTask.attemptHistory,
    reviews: [...summary.peerReviews, ...summary.teacherFeedback],
  });

  summary.evidenceCount = countWalletEvidence({
    github: summary.github,
    lms: summary.lms,
    practicalTasks: summary.practicalTask.attemptHistory,
    peerReviews: summary.peerReviews,
      teacherFeedback: summary.teacherFeedback,
      externalEvidence: summary.externalEvidence,
    });

  return summary;
}

function rowToWalletRecord(row: WalletCompetencyRecordRow): WalletCompetencyRecordView {
  const evidencePackage = normalizeSummary(row);
  const latestAttempt = evidencePackage.practicalTask.latestAttempt
    ?? evidencePackage.practicalTask.attemptHistory[0]
    ?? null;

  return {
    id: row.id,
    learnerId: row.learner_id,
    competencyId: row.competency_id,
    competencyName: evidencePackage.competency.name || row.competency_name,
    domain: evidencePackage.competency.domain || "General",
    description: evidencePackage.competency.description,
    learnerDid: evidencePackage.learner.did,
    learnerIdentityReference: evidencePackage.learner.identityReference ?? null,
    status: row.status,
    practicalTaskStatus: row.practical_task_status,
    taskResult: latestAttempt?.status ?? row.practical_task_status,
    verificationStatus: evidencePackage.status?.verificationStatus ?? "Unverified",
    walletRecordStatus: evidencePackage.status?.walletStatus ?? row.status,
    evidenceCount: evidencePackage.evidenceCount,
    sourceBadges: evidencePackage.sourceBadges,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    evidencePackage,
  };
}

function buildAttemptHistoryItem(row: Record<string, unknown>): WalletAttemptHistoryItem | null {
  const attemptId = asText(row.id ?? row.attempt_id);
  const title = asText(row.title) || "Practical task";
  const scorePercent = asNumber(row.percentage ?? row.score ?? row.resultPercentage);
  const correctCount = asNumber(row.correct_count ?? row.resultCorrectCount);
  const totalQuestions = asNumber(row.total_questions ?? row.resultTotalQuestions);
  const passed = row.passed === true;
  const submittedAt = asNullableText(row.submitted_at ?? row.updated_at ?? row.created_at);

  if (!attemptId && !title && submittedAt == null && scorePercent == null) return null;

  return {
    attemptId: attemptId || submittedAt || crypto.randomUUID(),
    title,
    status: deriveWalletPracticalTaskStatus({ passed, scorePercent }),
    submittedAt,
    scorePercent,
    correctCount,
    totalQuestions,
    passed,
  };
}

function dedupeRowsByKey<T extends Record<string, unknown>>(
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
  primary: {
    evidence: Record<string, unknown>[];
    courses: Record<string, unknown>[];
    assignments: Record<string, unknown>[];
    grades: Record<string, unknown>[];
    importedEvidence: Record<string, unknown>[];
    teacherFeedback: Record<string, unknown>[];
  },
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

async function safeFetchRows(
  table: string,
  run: () => Promise<{ data: unknown[] | null; error: { message?: string } | null }>,
): Promise<Record<string, unknown>[]> {
  try {
    const { data, error } = await run();
    if (error) {
      console.warn(`[wallet fallback] ${table} query failed:`, error.message ?? error);
      return [];
    }
    return Array.isArray(data)
      ? data.filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
      : [];
  } catch (error) {
    console.warn(`[wallet fallback] ${table} query threw:`, error);
    return [];
  }
}

async function fetchEvidenceRecords(
  client: ReturnType<typeof asUntypedClient>,
  userId: string,
): Promise<Record<string, unknown>[]> {
  const fullSelect =
    "id, mapped_skill_id, suggested_skill_id, source, repository_name, repository_url, language, commit_count, pr_summary, sync_date, status, external_id, description, metadata, last_updated";
  const basicSelect =
    "id, mapped_skill_id, suggested_skill_id, source, repository_name, repository_url, language, commit_count, pr_summary, sync_date, status, external_id, description, last_updated";

  try {
    const { data, error } = await client.from("evidence_records").select(fullSelect).eq("user_id", userId);
    if (!error && Array.isArray(data) && data.length > 0) {
      return data.filter((item): item is Record<string, unknown> => !!item && typeof item === "object");
    }
    if (error) {
      console.warn("[wallet] evidence_records full select failed:", error.message ?? error);
    }
  } catch (error) {
    console.warn("[wallet] evidence_records full select threw:", error);
  }

  return safeFetchRows("evidence_records", () =>
    client.from("evidence_records").select(basicSelect).eq("user_id", userId),
  );
}

async function safeFetchSingleRow(
  table: string,
  run: () => Promise<{ data: unknown; error: { message?: string } | null }>,
): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await run();
    if (error) {
      console.warn(`[wallet fallback] ${table} query failed:`, error.message ?? error);
      return null;
    }
    return asRecord(data);
  } catch (error) {
    console.warn(`[wallet fallback] ${table} query threw:`, error);
    return null;
  }
}

async function fetchDerivedWalletCompetencyRecords(
  userId: string,
): Promise<WalletCompetencyRecordView[]> {
  const client = asUntypedClient();
  const learnerProfile = await safeFetchSingleRow("learner_profiles", () =>
    client.from("learner_profiles").select("holder_did").eq("user_id", userId).maybeSingle(),
  );

  const [
    skillRows,
    githubRepos,
    githubActivities,
    lmsEvidence,
    moodleCourses,
    moodleAssignments,
    moodleGrades,
    moodleFeedback,
    peerReviews,
    practicalAttempts,
    mcqAttempts,
    evidenceRecords,
  ] = await Promise.all([
    safeFetchRows("declared_skills", () =>
      client.from("declared_skills").select("id, name, domain, description, created_at").eq("user_id", userId).order("created_at", { ascending: true }),
    ),
    safeFetchRows("github_repos", () =>
      client.from("github_repos").select("id, linked_skill_id, repo_name, full_name, github_url, primary_language, commit_count, last_updated, synced_at").eq("user_id", userId),
    ),
    safeFetchRows("github_activities", () =>
      client.from("github_activities").select("id, linked_skill_id, activity_type, activity_title, activity_url, repo_name, commit_hash, occurred_at, synced_at").eq("user_id", userId),
    ),
    safeFetchRows("lms_evidence", () =>
      client.from("lms_evidence").select("id, linked_skill_id, source, course_name, course_code, grade, completion_status, text_preview, fetched_at").eq("user_id", userId),
    ),
    safeFetchRows("moodle_courses", () =>
      client.from("moodle_courses").select("moodle_course_id, fullname, shortname, synced_at").eq("user_id", userId),
    ),
    safeFetchRows("moodle_assignments", () =>
      client.from("moodle_assignments").select("moodle_course_id, moodle_assignment_id, name, submission_status, grade, grade_max, grade_formatted, graded_at, submitted_at, competency_tags, feedback, synced_at").eq("user_id", userId),
    ),
    safeFetchRows("moodle_grades", () =>
      client.from("moodle_grades").select("moodle_course_id, item_id, item_name, item_type, grade, grade_max, grade_formatted, synced_at").eq("user_id", userId),
    ),
    safeFetchRows("moodle_feedback", () =>
      client.from("moodle_feedback").select("moodle_assignment_id, feedback_text, synced_at").eq("user_id", userId),
    ),
    safeFetchRows("peer_reviews", () =>
      client.from("peer_reviews").select("id, skill_id, skill, competency_name, reviewer_name, reviewer_role, source, review_text, comment, recommendation, reviewed_at, review_date, created_at").eq("learner_user_id", userId),
    ),
    safeFetchRows("practical_attempts", () =>
      client.from("practical_attempts").select("attempt_id, skill_id, status, score, passed, feedback, updated_at, created_at, submission").eq("user_id", userId),
    ),
    (async () => {
      const withEvaluation = await safeFetchRows("mcq_task_attempts", () =>
        client.from("mcq_task_attempts").select("id, skill_id, competency_name, competency_domain, title, status, percentage, correct_count, total_questions, passed, submitted_at, created_at").eq("learner_user_id", userId),
      );
      if (withEvaluation.length > 0) return withEvaluation;

      try {
        const { data, error } = await client
          .from("mcq_task_attempts")
          .select("id, skill_id, competency_name, competency_domain, title, status, passed, submitted_at, created_at")
          .eq("learner_user_id", userId);
        if (error) throw error;
        return Array.isArray(data)
          ? data.filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
          : [];
      } catch (error) {
        if (!isMissingColumnError(error)) {
          console.warn("[wallet fallback] mcq_task_attempts basic query failed:", error);
        }
        return [];
      }
    })(),
    fetchEvidenceRecords(client, userId),
  ]);

  const { github: githubEvidenceAll, lms: lmsEvidenceAll } = splitEvidenceRecordsBySource(evidenceRecords);
  const walletMatchLog: Array<{ skillName: string; matched: boolean }> = [];

  const derived = skillRows.map((skillRow) => {
    const competencyId = asText(skillRow.id);
    const competencyName = asText(skillRow.name);
    const domain = asText(skillRow.domain) || "General";
    const description = asText(skillRow.description);

    const skillGithubRepos = githubRepos.filter((row) => asText(row.linked_skill_id) === competencyId);
    const skillGithubActivities = githubActivities.filter((row) => asText(row.linked_skill_id) === competencyId);
    const skillGithubEvidenceRecords = githubEvidenceAll.filter((row) =>
      asText(row.mapped_skill_id) === competencyId
      || asText(row.suggested_skill_id) === competencyId,
    );
    const skillLmsEvidenceRecords = lmsEvidenceAll.filter((row) =>
      asText(row.mapped_skill_id) === competencyId,
    );
    walletMatchLog.push({
      skillName: competencyName,
      matched: skillLmsEvidenceRecords.length > 0,
    });

    const lmsFromRecords = buildLmsBundleFromEvidenceRecords(lmsEvidenceAll, competencyId);
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
      lmsFromRecords,
    );
    const skillPeerReviews = peerReviews.filter((row) =>
      asText(row.source) !== "LMS"
      && !isLmsPeerReviewRow(row)
      && (
        asText(row.skill_id) === competencyId
        || competencyMatches(row.skill, competencyName)
        || competencyMatches(row.competency_name, competencyName)
      ),
    );

    const mcqHistory = sortByLatest(
      mcqAttempts.filter((row) => asText(row.skill_id) === competencyId),
      ["submitted_at", "created_at"],
    )
      .map(buildAttemptHistoryItem)
      .filter((item): item is WalletAttemptHistoryItem => item !== null);

    const practicalRow = practicalAttempts.find((row) => asText(row.skill_id) === competencyId);
    if (mcqHistory.length === 0 && practicalRow) {
      const session = parseMcqSession(asText(practicalRow.submission));
      const fallbackAttempt = buildAttemptHistoryItem({
        id: practicalRow.attempt_id,
        title: competencyName ? `${competencyName} practical task` : "Practical task",
        score: practicalRow.score,
        resultPercentage: session?.resultPercentage,
        resultCorrectCount: session?.resultCorrectCount,
        resultTotalQuestions: session?.resultTotalQuestions,
        passed: practicalRow.passed,
        updated_at: practicalRow.updated_at,
        created_at: practicalRow.created_at,
      });
      if (fallbackAttempt) mcqHistory.push(fallbackAttempt);
    }

    const summary = buildWalletEvidenceSummary({
      competencyId,
      competencyName,
      competencyDomain: domain,
      competencyDescription: description,
      learnerId: userId,
      learnerDid: asNullableText(learnerProfile?.holder_did),
      github: {
        repos: sortByLatest(skillGithubRepos, ["last_updated", "synced_at"]),
        activities: sortByLatest(skillGithubActivities, ["occurred_at", "synced_at"]),
        evidenceRecords: sortByLatest(skillGithubEvidenceRecords, ["sync_date"]),
        reviews: [],
      },
      lms: {
        evidence: sortByLatest(aggregatedLms.evidence, ["fetched_at"]),
        courses: sortByLatest(aggregatedLms.courses, ["synced_at"]),
        assignments: sortByLatest(aggregatedLms.assignments, ["submitted_at", "graded_at", "synced_at"]),
        grades: sortByLatest(aggregatedLms.grades, ["synced_at"]),
        importedEvidence: sortByLatest(aggregatedLms.importedEvidence, ["imported_at"]),
      },
      practicalTasks: mcqHistory,
      peerReviews: sortByLatest(skillPeerReviews, ["reviewed_at", "review_date", "created_at"]),
      teacherFeedback: sortByLatest(aggregatedLms.teacherFeedback, ["reviewed_at"]),
      externalEvidence: [],
      institutionReview: {
        status: null,
        feedback: null,
        reviewedAt: null,
      },
      timestampGroups: {
        github: [
          ...skillGithubRepos.map((row) => asNullableText(row.last_updated) ?? asNullableText(row.synced_at)),
          ...skillGithubActivities.map((row) => asNullableText(row.occurred_at) ?? asNullableText(row.synced_at)),
          ...skillGithubEvidenceRecords.map((row) => asNullableText(row.sync_date)),
        ],
        lms: sortStringsByLatest([
          ...aggregatedLms.evidence.map((row) => asNullableText(row.fetched_at)),
          ...aggregatedLms.courses.map((row) => asNullableText(row.synced_at)),
          ...aggregatedLms.assignments.map((row) => asNullableText(row.submitted_at) ?? asNullableText(row.graded_at) ?? asNullableText(row.synced_at)),
          ...aggregatedLms.grades.map((row) => asNullableText(row.synced_at)),
          ...aggregatedLms.importedEvidence.map((row) => asNullableText(row.imported_at)),
        ]),
        practicalTask: mcqHistory.map((row) => row.submittedAt),
        peerReviews: skillPeerReviews.map((row) => asNullableText(row.reviewed_at) ?? asNullableText(row.review_date) ?? asNullableText(row.created_at)),
        teacherFeedback: aggregatedLms.teacherFeedback.map((row) => asNullableText(row.reviewed_at)),
        externalEvidence: [],
      },
    });

    if (summary.evidenceCount === 0) {
      return null;
    }

    const latestAttempt = summary.practicalTask.latestAttempt ?? summary.practicalTask.attemptHistory[0] ?? null;
    const status = deriveWalletRecordStatus({
      githubCount:
        summary.github.repos.length
        + summary.github.activities.length
        + summary.github.evidenceRecords.length
        + summary.github.reviews.length,
      lmsCount:
        summary.lms.evidence.length
        + summary.lms.courses.length
        + summary.lms.assignments.length
        + summary.lms.grades.length
        + summary.lms.importedEvidence.length,
      practicalTaskStatus: latestAttempt?.status ?? null,
      peerReviewCount: summary.peerReviews.length + summary.teacherFeedback.length,
    });

    const updatedAt = [
      ...summary.evidenceTimestamps.github,
      ...summary.evidenceTimestamps.lms,
      ...summary.evidenceTimestamps.practicalTask,
      ...summary.evidenceTimestamps.peerReviews,
      asNullableText(skillRow.created_at),
    ].filter((value): value is string => Boolean(value))
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
      ?? new Date().toISOString();

    const row: WalletCompetencyRecordRow = {
      id: `derived-${competencyId}`,
      learner_id: userId,
      competency_id: competencyId,
      competency_name: competencyName,
      status,
      practical_task_status: latestAttempt?.status ?? null,
      evidence_summary: summary,
      created_at: asNullableText(skillRow.created_at) ?? updatedAt,
      updated_at: updatedAt,
    };

    return rowToWalletRecord(row);
  });

  logWalletLoad({
    declaredSkillCount: skillRows.length,
    lmsEvidenceCount: lmsEvidenceAll.length,
    matches: walletMatchLog,
  });

  return derived
    .filter((record): record is WalletCompetencyRecordView => record !== null)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export async function fetchWalletCompetencyRecords(
  userId: string,
): Promise<WalletCompetencyRecordView[]> {
  return fetchDerivedWalletCompetencyRecords(userId);
}
