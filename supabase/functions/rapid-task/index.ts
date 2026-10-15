import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import {
  buildLocalFallbackGeneratePayload,
  collectSkillEvidence,
  generateTask,
  hasAiProviderConfigured,
  isRecoverableAIError,
  parseGenerateRequest,
  toGenerateApiResponse,
} from "../_shared/github-task-pipeline.ts";
import {
  buildAnswerKeyEntries,
  generateMcqTask,
  parseMcqGenerateBody,
  scoreMcqSubmission,
  stripQuestionForLearner,
} from "../_shared/mcq-pipeline.ts";
import {
  buildWalletEvidenceSummary,
  deriveWalletPracticalTaskStatus,
  deriveWalletRecordStatus,
  type WalletAttemptHistoryItem,
} from "../_shared/wallet-competency.ts";
import { collectPlatformEvidenceForTask } from "../_shared/platform-task-evidence.ts";
import {
  evaluateWalletReadyPromotion,
  GITHUB_EVIDENCE_SOURCE,
  hasQualifyingGitHubEvidenceRows,
  IN_WALLET_STAGE,
  normalizeGitHubRepoUrl,
  qualifyingGitHubTitle,
  WALLET_READY_STAGE,
} from "../_shared/wallet-ready-promotion.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function resolveUser(req: Request) {
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

  return { userId: userData.user.id, admin };
}

type QueryRow = Record<string, unknown>;
type AdminClient = ReturnType<typeof createClient>;

async function safeFetchArray<T extends QueryRow>(
  label: string,
  run: () => Promise<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const { data, error } = await run();
  if (error) {
    console.error(`${label} query failed:`, error.message);
    return [];
  }
  return data ?? [];
}

async function safeFetchSingle<T extends QueryRow>(
  label: string,
  run: () => Promise<{ data: T | null; error: { message: string } | null }>,
): Promise<T | null> {
  const { data, error } = await run();
  if (error) {
    console.error(`${label} query failed:`, error.message);
    return null;
  }
  return data ?? null;
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedText(value: unknown): string {
  return textValue(value).toLowerCase();
}

function numericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function matchesCompetency(value: unknown, competencyName: string): boolean {
  const left = normalizedText(value);
  const right = normalizedText(competencyName);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function matchesCompetencyTags(tags: unknown, competencyName: string): boolean {
  if (!Array.isArray(tags)) return false;
  return tags.some((tag) => {
    if (typeof tag === "string") return matchesCompetency(tag, competencyName);
    if (tag && typeof tag === "object") {
      const row = tag as QueryRow;
      return matchesCompetency(row.name, competencyName)
        || matchesCompetency(row.shortname, competencyName)
        || matchesCompetency(row.label, competencyName);
    }
    return false;
  });
}

function sortRowsByLatestDate<T extends QueryRow>(rows: T[], fields: string[]): T[] {
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

function mapAttemptHistoryItem(row: QueryRow): WalletAttemptHistoryItem {
  const scorePercent = numericValue(row.percentage);
  const passed = row.passed === true;
  return {
    attemptId: textValue(row.id),
    title: textValue(row.title) || "Practical task",
    status: deriveWalletPracticalTaskStatus({ passed, scorePercent }),
    submittedAt: textValue(row.submitted_at) || textValue(row.created_at) || null,
    scorePercent,
    correctCount: numericValue(row.correct_count),
    totalQuestions: numericValue(row.total_questions),
    passed,
  };
}

function pickLatestInstitutionReview(rows: QueryRow[]) {
  return sortRowsByLatestDate(rows, ["reviewed_at", "submitted_to_institution_at", "created_at"])[0] ?? null;
}


async function ensureGitHubSupportingRecords(
  admin: AdminClient,
  userId: string,
  skillId: string,
): Promise<{
  repos: Array<{ title?: string | null; url?: string | null }>;
  supporting: Array<{ source?: string | null; title?: string | null; url?: string | null }>;
}> {
  const connection = await safeFetchSingle<QueryRow>("github_connections promotion", () =>
    admin
      .from("github_connections")
      .select("github_username")
      .eq("user_id", userId)
      .maybeSingle(),
  );
  const connectedUsername = (textValue(connection?.github_username) || "").trim().toLowerCase();

  const repos = connectedUsername
    ? await safeFetchArray<QueryRow>("github_repos promotion", () =>
      admin
        .from("github_repos")
        .select("repo_name, github_url, last_updated, linked_skill_id, github_username")
        .eq("user_id", userId)
        .eq("linked_skill_id", skillId),
    )
    : [];

  const ownedSkill = await safeFetchSingle<QueryRow>("declared_skills promotion", () =>
    admin
      .from("declared_skills")
      .select("id, pipeline_stage")
      .eq("id", skillId)
      .eq("user_id", userId)
      .maybeSingle(),
  );

  const qualifyingRepos = repos.flatMap((row) => {
    const rowUsername = (textValue(row.github_username) || "").trim().toLowerCase();
    if (rowUsername !== connectedUsername) return [];
    const title = qualifyingGitHubTitle(textValue(row.repo_name) || null);
    const url = normalizeGitHubRepoUrl(textValue(row.github_url) || null);
    if (!title || !url) return [];
    return [{
      title,
      url,
      occurredAt: textValue(row.last_updated) || new Date().toISOString(),
    }];
  });

  if (ownedSkill?.id) {
    const existing = await safeFetchArray<QueryRow>("supporting_records promotion", () =>
      admin
        .from("supporting_records")
        .select("id, source, title, url")
        .eq("user_id", userId)
        .eq("skill_id", skillId)
        .eq("source", GITHUB_EVIDENCE_SOURCE),
    );

    for (const repo of qualifyingRepos) {
      const duplicate = existing.find((row) => normalizeGitHubRepoUrl(textValue(row.url) || null) === repo.url);
      if (duplicate?.id) {
        await admin
          .from("supporting_records")
          .update({
            title: repo.title,
            url: repo.url,
            occurred_at: repo.occurredAt,
          })
          .eq("id", duplicate.id)
          .eq("user_id", userId)
          .eq("skill_id", skillId);
        continue;
      }
      const { data: inserted } = await admin
        .from("supporting_records")
        .insert({
          user_id: userId,
          skill_id: skillId,
          source: GITHUB_EVIDENCE_SOURCE,
          title: repo.title,
          url: repo.url,
          occurred_at: repo.occurredAt,
        })
        .select("id, source, title, url")
        .maybeSingle();
      if (inserted) existing.push(inserted);
    }
  }

  const supporting = await safeFetchArray<QueryRow>("supporting_records promotion read", () =>
    admin
      .from("supporting_records")
      .select("source, title, url")
      .eq("user_id", userId)
      .eq("skill_id", skillId),
  );

  return {
    repos: qualifyingRepos,
    supporting: supporting.map((row) => ({
      source: textValue(row.source) || null,
      title: textValue(row.title) || null,
      url: textValue(row.url) || null,
    })),
  };
}

async function upsertWalletCompetencyRecord(params: {
  admin: AdminClient;
  userId: string;
  skillId: string;
  competencyName: string;
  competencyDomain: string;
}): Promise<void> {
  const { admin, userId, skillId } = params;

  const skillRow = await safeFetchSingle<QueryRow>(
    "declared_skills wallet",
    () =>
      admin
        .from("declared_skills")
        .select("id, name, domain, description")
        .eq("user_id", userId)
        .eq("id", skillId)
        .maybeSingle(),
  );

  if (!skillRow) {
    console.error("wallet upsert skipped: declared skill not found", { userId, skillId });
    return;
  }

  const competencyName = textValue(skillRow.name) || params.competencyName;
  const competencyDomain = textValue(skillRow.domain) || params.competencyDomain || "General";
  const competencyDescription = textValue(skillRow.description);

  const learnerProfile = await safeFetchSingle<QueryRow>(
    "learner_profiles wallet",
    () =>
      admin
        .from("learner_profiles")
        .select("holder_did")
        .eq("user_id", userId)
        .maybeSingle(),
  );

  const [
    githubRepos,
    githubActivities,
    githubEvidenceRecords,
    githubReviews,
    lmsEvidence,
    moodleAssignmentsRaw,
    moodleCoursesRaw,
    moodleGradesRaw,
    moodleFeedbackRaw,
    importedLmsRaw,
    peerReviewsRaw,
    attestationRequestsRaw,
    mcqAttemptsRaw,
  ] = await Promise.all([
    safeFetchArray<QueryRow>("github_repos wallet", () =>
      admin
        .from("github_repos")
        .select("id, repo_name, full_name, github_url, primary_language, commit_count, last_updated, synced_at")
        .eq("user_id", userId)
        .eq("linked_skill_id", skillId),
    ),
    safeFetchArray<QueryRow>("github_activities wallet", () =>
      admin
        .from("github_activities")
        .select("id, activity_type, activity_title, activity_url, repo_name, commit_hash, occurred_at, synced_at")
        .eq("user_id", userId)
        .eq("linked_skill_id", skillId),
    ),
    safeFetchArray<QueryRow>("evidence_records wallet", () =>
      admin
        .from("evidence_records")
        .select("id, source, repository_name, repository_url, language, commit_count, pr_summary, sync_date, metadata, status")
        .eq("user_id", userId)
        .or(`mapped_skill_id.eq.${skillId},suggested_skill_id.eq.${skillId}`),
    ),
    safeFetchArray<QueryRow>("github_discussion_reviews wallet", () =>
      admin
        .from("github_discussion_reviews")
        .select("id, discussion_title, discussion_url, comment_author, comment_body, comment_created_at, competency_name, review_type, status")
        .eq("learner_user_id", userId),
    ),
    safeFetchArray<QueryRow>("lms_evidence wallet", () =>
      admin
        .from("lms_evidence")
        .select("id, linked_skill_id, source, course_name, course_code, grade, completion_status, text_preview, fetched_at")
        .eq("user_id", userId),
    ),
    safeFetchArray<QueryRow>("moodle_assignments wallet", () =>
      admin
        .from("moodle_assignments")
        .select("id, moodle_course_id, moodle_assignment_id, name, submission_status, grade, grade_max, grade_formatted, graded_at, submitted_at, competency_tags, synced_at")
        .eq("user_id", userId),
    ),
    safeFetchArray<QueryRow>("moodle_courses wallet", () =>
      admin
        .from("moodle_courses")
        .select("id, moodle_course_id, fullname, shortname, synced_at")
        .eq("user_id", userId),
    ),
    safeFetchArray<QueryRow>("moodle_grades wallet", () =>
      admin
        .from("moodle_grades")
        .select("id, moodle_course_id, item_id, item_name, item_type, grade, grade_max, grade_formatted, synced_at")
        .eq("user_id", userId),
    ),
    safeFetchArray<QueryRow>("moodle_feedback wallet", () =>
      admin
        .from("moodle_feedback")
        .select("id, moodle_assignment_id, feedback_text, grader_id, synced_at")
        .eq("user_id", userId),
    ),
    safeFetchArray<QueryRow>("imported_lms_evidence wallet", () =>
      admin
        .from("imported_lms_evidence")
        .select("id, moodle_course_id, moodle_assignment_id, course_name, activity_name, activity_type, grade, grade_max, submission_status, feedback_preview, imported_at")
        .eq("user_id", userId),
    ),
    safeFetchArray<QueryRow>("peer_reviews wallet", () =>
      admin
        .from("peer_reviews")
        .select("id, skill, skill_id, competency_name, competency_domain, reviewer_name, reviewer_role, source, review_text, decision, reviewed_at, review_date, evidence_label, recommendation, verification_status")
        .eq("learner_user_id", userId),
    ),
    safeFetchArray<QueryRow>("institution_attestation_requests wallet", () =>
      admin
        .from("institution_attestation_requests")
        .select("id, status, institution_feedback, reviewed_at, submitted_to_institution_at, created_at, practical_task_result, skill_id, competency_name")
        .eq("learner_user_id", userId),
    ),
    safeFetchArray<QueryRow>("mcq_task_attempts wallet", () =>
      admin
        .from("mcq_task_attempts")
        .select("id, title, percentage, correct_count, total_questions, passed, submitted_at, created_at, skill_id")
        .eq("learner_user_id", userId)
        .eq("skill_id", skillId),
    ),
  ]);

  const githubReviewMatches = githubReviews.filter((row) =>
    row.skill_id === skillId || matchesCompetency(row.competency_name, competencyName),
  );

  const matchingAssignments = moodleAssignmentsRaw.filter((row) => (
    matchesCompetencyTags(row.competency_tags, competencyName)
    || matchesCompetency(row.name, competencyName)
  ));
  const assignmentIds = new Set(
    matchingAssignments
      .map((row) => numericValue(row.moodle_assignment_id))
      .filter((value): value is number => value != null),
  );
  const courseIds = new Set(
    matchingAssignments
      .map((row) => numericValue(row.moodle_course_id))
      .filter((value): value is number => value != null),
  );

  for (const row of moodleCoursesRaw) {
    if (matchesCompetency(row.fullname, competencyName) || matchesCompetency(row.shortname, competencyName)) {
      const courseId = numericValue(row.moodle_course_id);
      if (courseId != null) courseIds.add(courseId);
    }
  }

  const lmsEvidence = lmsEvidenceRaw.filter((row) =>
    row.linked_skill_id === skillId
    || matchesCompetency(row.course_name, competencyName)
    || matchesCompetency(row.course_code, competencyName)
    || matchesCompetency(row.text_preview, competencyName),
  );

  const importedLmsEvidence = importedLmsRaw.filter((row) => {
    const assignmentId = numericValue(row.moodle_assignment_id);
    const courseId = numericValue(row.moodle_course_id);
    return (
      (assignmentId != null && assignmentIds.has(assignmentId))
      || (courseId != null && courseIds.has(courseId))
      || matchesCompetency(row.activity_name, competencyName)
      || matchesCompetency(row.course_name, competencyName)
    );
  });

  for (const row of importedLmsEvidence) {
    const courseId = numericValue(row.moodle_course_id);
    if (courseId != null) courseIds.add(courseId);
  }

  const moodleCourses = moodleCoursesRaw.filter((row) => {
    const courseId = numericValue(row.moodle_course_id);
    return courseId != null && courseIds.has(courseId);
  });

  const moodleGrades = moodleGradesRaw.filter((row) => {
    const courseId = numericValue(row.moodle_course_id);
    return courseId != null && courseIds.has(courseId);
  });

  const moodleFeedback = moodleFeedbackRaw.filter((row) => {
    const assignmentId = numericValue(row.moodle_assignment_id);
    return assignmentId != null && assignmentIds.has(assignmentId);
  });

  const peerReviews = peerReviewsRaw.filter((row) => {
    if (textValue(row.source) === "LMS") return false;
    const source = normalizedText(row.source);
    const origin = normalizedText(row.origin);
    const role = normalizedText(row.reviewer_role);
    if (source.includes("lms") || source.includes("moodle") || origin.includes("moodle")
      || role.includes("teacher feedback") || role.includes("lms instructor")) {
      return false;
    }
    return row.skill_id === skillId
      || matchesCompetency(row.skill, competencyName)
      || matchesCompetency(row.competency_name, competencyName);
  });

  const attestationRequests = attestationRequestsRaw.filter((row) => (
    row.skill_id === skillId || matchesCompetency(row.competency_name, competencyName)
  ));
  const latestInstitutionReview = pickLatestInstitutionReview(attestationRequests);

  const teacherFeedback = [
    ...moodleFeedback.map((row) => ({
      source: "Moodle",
      moodle_assignment_id: row.moodle_assignment_id,
      feedback_text: row.feedback_text,
      grader_id: row.grader_id,
      synced_at: row.synced_at,
    })),
    ...(latestInstitutionReview?.institution_feedback
      ? [{
          source: "Institution",
          feedback_text: latestInstitutionReview.institution_feedback,
          status: latestInstitutionReview.status,
          reviewed_at: latestInstitutionReview.reviewed_at,
        }]
      : []),
  ];

  const attemptHistory = sortRowsByLatestDate(mcqAttemptsRaw, ["submitted_at", "created_at"])
    .map(mapAttemptHistoryItem);
  const latestAttempt = attemptHistory[0] ?? null;

  const githubEvidenceOnly = githubEvidenceRecords.filter((row) => textValue(row.source) !== "LMS");
  const lmsEvidenceRecords = githubEvidenceRecords.filter((row) => textValue(row.source) === "LMS");
  const lmsFromRecords = {
    evidence: lmsEvidenceRecords.map((row) => {
      const metadata = (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Record<string, unknown>;
      const grade = metadata.grade;
      const gradeMax = metadata.grade_max;
      return {
        id: row.id,
        course_name: metadata.course_name ?? row.repository_name,
        assignment_name: metadata.assignment_name ?? row.description,
        grade: grade != null && gradeMax != null ? `${grade}/${gradeMax}` : grade,
        text_preview: metadata.assignment_name ?? row.description,
        fetched_at: row.sync_date,
        metadata,
      };
    }),
    courses: lmsEvidenceRecords.map((row) => {
      const metadata = (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Record<string, unknown>;
      return {
        moodle_course_id: metadata.moodle_course_id,
        fullname: metadata.course_name ?? "LMS Course",
        shortname: null,
        synced_at: row.sync_date,
      };
    }),
    assignments: lmsEvidenceRecords.map((row) => {
      const metadata = (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Record<string, unknown>;
      const grade = metadata.grade;
      const gradeMax = metadata.grade_max;
      return {
        moodle_assignment_id: metadata.moodle_assignment_id,
        name: metadata.assignment_name ?? row.description,
        grade,
        grade_max: gradeMax,
        grade_formatted: grade != null && gradeMax != null ? `${grade}/${gradeMax}` : null,
        feedback: metadata.teacher_feedback,
        synced_at: row.sync_date,
      };
    }),
  };
  const teacherFeedbackFromRecords = lmsEvidenceRecords
    .map((row) => {
      const metadata = (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Record<string, unknown>;
      const text = metadata.teacher_feedback;
      if (!text || typeof text !== "string") return null;
      return {
        source: "Moodle Teacher Feedback",
        feedback_text: text,
        reviewed_at: row.sync_date,
        moodle_assignment_id: metadata.moodle_assignment_id,
      };
    })
    .filter(Boolean);

  const summary = buildWalletEvidenceSummary({
    competencyId: skillId,
    competencyName,
    competencyDomain,
    competencyDescription,
    learnerId: userId,
    learnerDid: textValue(learnerProfile?.holder_did) || null,
    github: {
      repos: sortRowsByLatestDate(githubRepos, ["last_updated", "synced_at"]),
      activities: sortRowsByLatestDate(githubActivities, ["occurred_at", "synced_at"]),
      evidenceRecords: sortRowsByLatestDate(githubEvidenceOnly, ["sync_date"]),
      reviews: sortRowsByLatestDate(githubReviewMatches, ["comment_created_at", "created_at"]),
    },
    lms: {
      evidence: sortRowsByLatestDate([...lmsFromRecords.evidence, ...lmsEvidence], ["fetched_at"]),
      courses: sortRowsByLatestDate([...lmsFromRecords.courses, ...moodleCourses], ["synced_at"]),
      assignments: sortRowsByLatestDate([...lmsFromRecords.assignments, ...matchingAssignments], ["submitted_at", "graded_at", "synced_at"]),
      grades: sortRowsByLatestDate(moodleGrades, ["synced_at"]),
      importedEvidence: sortRowsByLatestDate(importedLmsEvidence, ["imported_at"]),
    },
    practicalTasks: attemptHistory,
    peerReviews: sortRowsByLatestDate(peerReviews, ["reviewed_at", "review_date", "created_at"]),
    teacherFeedback: sortRowsByLatestDate([...teacherFeedbackFromRecords, ...teacherFeedback], ["reviewed_at", "synced_at", "created_at"]),
    institutionReview: {
      status: textValue(latestInstitutionReview?.status) || null,
      feedback: textValue(latestInstitutionReview?.institution_feedback) || null,
      reviewedAt: textValue(latestInstitutionReview?.reviewed_at) || null,
    },
    timestampGroups: {
      github: [
        ...githubRepos.map((row) => textValue(row.last_updated) || textValue(row.synced_at) || null),
        ...githubActivities.map((row) => textValue(row.occurred_at) || textValue(row.synced_at) || null),
        ...githubEvidenceRecords.map((row) => textValue(row.sync_date) || null),
        ...githubReviewMatches.map((row) => textValue(row.comment_created_at) || null),
      ],
      lms: [
        ...lmsEvidence.map((row) => textValue(row.fetched_at) || null),
        ...moodleCourses.map((row) => textValue(row.synced_at) || null),
        ...matchingAssignments.map((row) => textValue(row.submitted_at) || textValue(row.graded_at) || textValue(row.synced_at) || null),
        ...moodleGrades.map((row) => textValue(row.synced_at) || null),
        ...importedLmsEvidence.map((row) => textValue(row.imported_at) || null),
      ],
      practicalTask: attemptHistory.map((row) => row.submittedAt),
      peerReviews: peerReviews.map((row) => textValue(row.reviewed_at) || textValue(row.review_date) || null),
      teacherFeedback: teacherFeedback.map((row) => textValue(row.reviewed_at) || textValue(row.synced_at) || null),
    },
  });

  const walletStatus = deriveWalletRecordStatus({
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

  const { error } = await admin
    .from("wallet_competency_records")
    .upsert(
      {
        learner_id: userId,
        competency_id: skillId,
        competency_name: competencyName,
        status: walletStatus,
        practical_task_status: latestAttempt?.status ?? null,
        evidence_summary: summary,
      },
      { onConflict: "learner_id,competency_id" },
    );

  if (error) {
    console.error("wallet_competency_records upsert error:", error.message);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN") ?? undefined;
    const CLASSIFY_MODEL = Deno.env.get("GEMINI_CLASSIFY_MODEL") ?? "gemini-2.5-flash";
    const TASK_MODEL = Deno.env.get("GEMINI_TASK_MODEL") ?? "gemini-2.5-flash";

    if (body.action === "generate") {
      const { skill, repos, variationSeed } = parseGenerateRequest(body);
      const skillName = skill.name;
      const skillDomain = skill.domain ?? "General";

      if (body.taskType === "mcq") {
        const auth = await resolveUser(req);
        if ("error" in auth && auth.error) return auth.error;
        const { userId, admin } = auth as { userId: string; admin: ReturnType<typeof createClient> };

        const parsed = parseMcqGenerateBody(body);
        const skillId = parsed.skillId;
        const platformEvidence = await collectPlatformEvidenceForTask(
          admin,
          userId,
          skillId,
          skillName,
        );
        const reposForEvidence = platformEvidence.githubRepos.length
          ? platformEvidence.githubRepos
          : repos;

        const { classification, evidence, evidenceMeta } = await collectSkillEvidence({
          skill: { name: skillName },
          repos: reposForEvidence,
          githubToken: GITHUB_TOKEN,
          classifyModel: CLASSIFY_MODEL,
        });

        const { test, fallback } = await generateMcqTask({
          skillName,
          classification,
          evidenceFiles: evidence.files,
          evidenceLanguages: evidence.languages,
          repo: evidenceMeta.repo,
          taskModel: TASK_MODEL,
          variationSeed: variationSeed ?? crypto.randomUUID(),
          platformEvidence: platformEvidence.promptBlock,
        });

        const learnerQuestions = test.questions.map(stripQuestionForLearner);
        const answerKey = buildAnswerKeyEntries(test.questions);

        const evidencePackage = {
          competencyName: skillName,
          githubEvidence: {
            repo: evidenceMeta.repo,
            fileCount: evidenceMeta.fileCount,
          },
          platformEvidence: platformEvidence.sources,
          classification,
        };

        const { data: attempt, error: attemptError } = await admin
          .from("mcq_task_attempts")
          .insert({
            learner_user_id: userId,
            skill_id: skillId ?? null,
            competency_name: skillName,
            competency_domain: skillDomain,
            questions: learnerQuestions,
            answer_key: answerKey,
            status: "in_progress",
            passed: false,
            title: test.title,
            duration_minutes: test.durationMinutes || 15,
            evidence_package: evidencePackage,
            classification,
          })
          .select("id")
          .single();

        if (attemptError || !attempt) {
          console.error("mcq_task_attempts insert error:", attemptError);
          return json({ error: "Could not create MCQ attempt", details: attemptError?.message }, 500);
        }

        return json({
          attemptId: attempt.id,
          title: test.title,
          type: "MCQ",
          durationMinutes: test.durationMinutes || 15,
          questions: learnerQuestions,
          skill: skillName,
          classification,
          evidence: {
            repo: evidenceMeta.repo,
            fileCount: evidenceMeta.fileCount,
            platforms: {
              github: platformEvidence.sources.github.length,
              lms: platformEvidence.sources.lms.length,
              moodle: platformEvidence.sources.moodle.length,
              uploads: platformEvidence.sources.uploads.length,
              linkedin: platformEvidence.sources.linkedin ? 1 : 0,
            },
          },
          fallback,
        });
      }

      const { classification, evidence, evidenceMeta } = await collectSkillEvidence({
        skill,
        repos,
        githubToken: GITHUB_TOKEN,
        classifyModel: CLASSIFY_MODEL,
      });

      if (!hasAiProviderConfigured()) {
        console.log("No AI providers configured, using local fallback task for:", skillName);
        return json(buildLocalFallbackGeneratePayload(skillName, skillDomain));
      }

      try {
        let generated;
        try {
          generated = await generateTask(skill, classification, "", TASK_MODEL, variationSeed);
        } catch (genErr) {
          console.error("generateTask failed, retrying:", genErr);
          generated = await generateTask(
            skill,
            classification,
            "",
            TASK_MODEL,
            variationSeed ? `${variationSeed}-retry` : undefined,
          );
        }

        if (!generated?.questions || generated.questions.length < 5) {
          throw new Error("AI returned incomplete question set");
        }
        if (!generated?.title || (!generated.scenario && !generated.instructions)) {
          throw new Error("AI returned incomplete task");
        }

        const payload = toGenerateApiResponse(generated, skillName, skillDomain, {
          classification,
          evidence: evidenceMeta,
        });
        payload.aiGenerated = true;
        payload.variationSeed = variationSeed;

        return json(payload);
      } catch (err) {
        console.error("All AI providers failed:", err);
        const message = err instanceof Error ? err.message : String(err);
        if (isRecoverableAIError(err)) {
          return json(buildLocalFallbackGeneratePayload(skillName, skillDomain));
        }
        return json({ error: "Task generation failed", details: message }, 500);
      }
    }

    if (body.action === "evaluate") {
      if (body.taskType === "mcq") {
        const auth = await resolveUser(req);
        if ("error" in auth && auth.error) return auth.error;
        const { userId, admin } = auth as { userId: string; admin: ReturnType<typeof createClient> };

        const attemptId = String(body.attemptId ?? "");
        const answers = (body.answers ?? {}) as Record<string, unknown>;

        if (!attemptId) {
          return json({ error: "Missing attemptId" }, 400);
        }

        console.log("[mcq-evaluate] attemptId:", attemptId);
        console.log("[mcq-evaluate] raw selected answers:", JSON.stringify(answers));

        const { data: attempt, error: fetchErr } = await admin
          .from("mcq_task_attempts")
          .select(`
            id,
            learner_user_id,
            skill_id,
            competency_name,
            competency_domain,
            questions,
            answer_key,
            status,
            title,
            evidence_package,
            classification
          `)
          .eq("id", attemptId)
          .maybeSingle();

        if (fetchErr) return json({ error: fetchErr.message }, 500);
        if (!attempt) return json({ error: "MCQ attempt not found" }, 404);
        if (attempt.learner_user_id !== userId) return json({ error: "Forbidden" }, 403);
        if (attempt.status !== "in_progress") {
          return json({ error: "MCQ attempt already submitted" }, 400);
        }

        const { correctCount, totalQuestions, percentage, passed } = scoreMcqSubmission(
          attempt.answer_key,
          answers,
        );
        const submittedAt = new Date().toISOString();
        const resultLabel = passed ? "Passed" : "Needs Improvement";

        const { error: updateErr } = await admin
          .from("mcq_task_attempts")
          .update({
            learner_answers: answers,
            correct_count: correctCount,
            total_questions: totalQuestions,
            percentage,
            passed,
            status: "completed",
            feedback: passed
              ? `MCQ passed with ${percentage}%.`
              : `MCQ score ${percentage}% — needs improvement (pass threshold is 60%).`,
            submitted_at: submittedAt,
          })
          .eq("id", attemptId);

        if (updateErr) {
          return json({ error: updateErr.message }, 500);
        }

        let walletReady = false;
        let promotionReason: string | null = null;

        const skillId = textValue(attempt.skill_id) || null;
        if (skillId) {
          const skillRow = await safeFetchSingle<QueryRow>("declared_skills stage", () =>
            admin
              .from("declared_skills")
              .select("id, pipeline_stage, status")
              .eq("id", skillId)
              .eq("user_id", userId)
              .maybeSingle(),
          );

          const evidence = await ensureGitHubSupportingRecords(admin, userId, skillId);
          const hasGitHub = hasQualifyingGitHubEvidenceRows(evidence.repos, evidence.supporting);
          const decision = evaluateWalletReadyPromotion({
            callerUserId: userId,
            attemptOwnerId: String(attempt.learner_user_id ?? ""),
            skillId,
            attemptStatus: "in_progress",
            scoredPassed: passed,
            scoredPercent: percentage,
            hasQualifyingGitHubEvidence: hasGitHub,
            storedPipelineStage: textValue(skillRow?.pipeline_stage) || null,
            clientClaimedPassed: body.passed === true,
            storedAttemptPassed: attempt.passed === true,
          });

          if (decision.promote && skillRow && textValue(skillRow.pipeline_stage) !== IN_WALLET_STAGE) {
            const now = new Date().toISOString();
            const { error: stageErr } = await admin
              .from("declared_skills")
              .update({
                pipeline_stage: WALLET_READY_STAGE,
                status: "Wallet Ready",
                last_related_activity_at: now,
              })
              .eq("id", skillId)
              .eq("user_id", userId)
              .neq("pipeline_stage", IN_WALLET_STAGE);
            if (stageErr) {
              console.error("wallet_ready promotion failed:", stageErr.message);
              promotionReason = "stage_update_failed";
            } else {
              walletReady = true;
            }
          } else if (!decision.promote) {
            promotionReason = decision.reason;
          }

          await upsertWalletCompetencyRecord({
            admin,
            userId,
            skillId,
            competencyName: attempt.competency_name ?? "",
            competencyDomain: attempt.competency_domain ?? "General",
          });
        } else {
          promotionReason = "missing_skill";
        }

        return json({
          submitted: true,
          percentage,
          correctCount,
          totalQuestions,
          passed,
          resultLabel,
          passThreshold: 60,
          walletReady,
          promotionReason,
          attestationSent: false,
          message: walletReady
            ? `Test submitted successfully. Your result is ${percentage}% — Passed. This competency is wallet-ready.`
            : passed
              ? `Test submitted successfully. Your result is ${percentage}% — Passed. Qualifying linked GitHub evidence is required for wallet-ready.`
              : `Test submitted successfully. Your result is ${percentage}% — Needs Improvement.`,
        });
      }

      if (!hasAiProviderConfigured()) {
        return json({
          passed: false,
          evaluationUnavailable: true,
          feedback:
            "Evaluation service is temporarily unavailable. The learner submission was received, but it was not graded.",
        });
      }

      const task = body.task;
      const submission = body.submission;
      const skill = body.skill;

      if (!task) {
        return json({ error: "Missing task for evaluation", receivedKeys: Object.keys(body) }, 400);
      }
      if (!submission || String(submission).trim().length === 0) {
        return json({ error: "Missing learner submission for evaluation", receivedKeys: Object.keys(body) }, 400);
      }

      const { evaluateSubmission } = await import("../_shared/github-task-pipeline.ts");
      const evaluationTask = {
        ...task,
        skill: skill?.name || task.skill || task.skillName || "Unknown",
        acceptance_criteria: task.acceptance_criteria || task.acceptanceCriteria || task.acceptanceCriteriaJson || [],
        evaluation_rubric: task.evaluation_rubric || task.evaluationRubric || task.rubric || [],
      };

      try {
        const evaluation = await evaluateSubmission({
          task: evaluationTask,
          submission: String(submission),
          testResults: body.testResults,
        });

        return json({
          passed: evaluation.overall_pass ?? false,
          score: evaluation.score ?? 0,
          feedback: evaluation.feedback ?? "Evaluation completed.",
          evaluation,
          criteria_results: evaluation.criteria_results ?? [],
        });
      } catch (err) {
        console.error("AI evaluation failed:", err);
        return json({
          passed: false,
          evaluationUnavailable: true,
          feedback:
            "Evaluation service is temporarily unavailable. The learner submission was received, but it was not graded.",
        });
      }
    }

    return json({ error: "Invalid action. Use 'generate' or 'evaluate'." }, 400);
  } catch (e) {
    console.error("rapid-task error:", e);
    return json({ error: String(e) }, 500);
  }
});
