import type { SharedCompetencyVersion } from "@/services/api/recruiter-workspace.api";

export type DisclosedCompetencyVersion = {
  id: string;
  skill: string;
  issuedAt: string;
  issuer: string | null;
  status: string;
};

export type JourneyMilestoneKind =
  | "credential"
  | "assessment"
  | "achievement"
  | "version"
  | "integration";

export type JourneyVerification = "Verified" | "Shared" | "Pending" | "Not verified";

export type JourneyMilestone = {
  id: string;
  kind: JourneyMilestoneKind;
  title: string;
  detail: string;
  date: string;
  verification: JourneyVerification;
  skill: string;
  attemptNumber?: number | null;
  attemptTotal?: number | null;
  scoreLabel?: string | null;
  outcome?: string | null;
  /** Optional external link (e.g. GitHub repo or commit). */
  url?: string | null;
};

export type JourneySummary = {
  milestoneCount: number;
  attemptCount: number;
  bestScoreLabel: string | null;
  firstDate: string | null;
  lastDate: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) return Number(value);
  return null;
}

function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
    : [];
}

function skillMatches(value: string | null | undefined, skill: string): boolean {
  if (!value) return false;
  return value.trim().toLowerCase() === skill.trim().toLowerCase();
}

function firstDate(...values: unknown[]): string | null {
  for (const value of values) {
    const text = asText(value);
    if (!text) continue;
    const time = Date.parse(text);
    if (!Number.isNaN(time)) return new Date(time).toISOString();
  }
  return null;
}

function sortByDateAsc(left: JourneyMilestone, right: JourneyMilestone): number {
  return Date.parse(left.date) - Date.parse(right.date);
}

/** Legacy helper: disclosed credentials for one skill, oldest first. */
export function competencyJourney(
  credentials: Array<{ id: string; skill: string; issuedAt: string; issuer?: string | null; status?: string | null }>,
  skill: string,
): DisclosedCompetencyVersion[] {
  const wanted = skill.trim().toLowerCase();
  return credentials
    .filter((row) => row.skill.trim().toLowerCase() === wanted && row.id && row.issuedAt)
    .map((row) => ({
      id: row.id,
      skill: row.skill,
      issuedAt: row.issuedAt,
      issuer: row.issuer?.trim() || null,
      status: row.status?.trim() || "Shared",
    }))
    .sort((left, right) => Date.parse(left.issuedAt) - Date.parse(right.issuedAt));
}

function versionVerification(version: SharedCompetencyVersion): JourneyVerification {
  if (version.status === "issued" && version.hasCredential) {
    return version.anchorStatus === "confirmed" ? "Verified" : "Shared";
  }
  if (version.status === "awaiting_validation") return "Pending";
  return "Not verified";
}

function credentialMilestones(
  credentials: Array<{ id: string; skill: string; issuedAt: string; issuer?: string | null; status?: string | null }>,
  skill: string,
): JourneyMilestone[] {
  return competencyJourney(credentials, skill).map((row) => ({
    id: `credential:${row.id}`,
    kind: "credential" as const,
    title: "Credential shared",
    detail: row.issuer
      ? `Shared with recruiters · Issued by ${row.issuer}`
      : "Competency credential shared with recruiters",
    date: row.issuedAt,
    verification: (row.status.toLowerCase().includes("verified") ? "Verified" : "Shared") as JourneyVerification,
    skill: row.skill,
    outcome: row.status,
  }));
}

function recordedVersionMilestones(
  versions: SharedCompetencyVersion[],
  skill: string,
): JourneyMilestone[] {
  return versions
    .filter((version) => skillMatches(version.skillName, skill))
    .map((version) => ({
      id: `version:${version.id}`,
      kind: "version" as const,
      title: version.status === "issued"
        ? `Credential version ${version.versionNumber}`
        : `Progress version ${version.versionNumber}`,
      detail: version.status === "issued"
        ? (version.hasCredential
          ? "Signed credential recorded from shared progress"
          : "Version marked issued without a stored credential id")
        : version.status === "awaiting_validation"
          ? "Evidence recorded · awaiting validation"
          : "Evidence recorded for this competency",
      date: version.createdAt,
      verification: versionVerification(version),
      skill: version.skillName,
      outcome: version.status,
    }));
}

function evidencePackage(payload: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!payload) return {};
  return asRecord(payload.evidence)
    ?? asRecord(payload.complete_evidence_package)
    ?? asRecord(payload.evidencePackage)
    ?? {};
}

function scoreLabelFrom(attempt: Record<string, unknown>): string | null {
  const percent = asNumber(attempt.scorePercent)
    ?? asNumber(attempt.score)
    ?? asNumber(attempt.percentage);
  const correct = asNumber(attempt.correctCount) ?? asNumber(attempt.correct);
  const total = asNumber(attempt.totalQuestions) ?? asNumber(attempt.total);
  if (percent != null) {
    if (correct != null && total != null) return `${Math.round(percent)}% (${correct}/${total})`;
    return `${Math.round(percent)}%`;
  }
  if (correct != null && total != null) return `${correct}/${total}`;
  const raw = asText(attempt.result);
  return raw;
}

function practicalMilestones(payload: Record<string, unknown> | null | undefined, skill: string): JourneyMilestone[] {
  const evidence = evidencePackage(payload);
  const practical = asRecord(evidence.practicalTask) ?? asRecord(payload?.practicalTask);
  if (!practical) return [];

  const history = asRecords(practical.attemptHistory);
  const latest = asRecord(practical.latestAttempt);
  const byId = new Map<string, Record<string, unknown>>();

  for (const attempt of history) {
    const key = asText(attempt.attemptId)
      ?? asText(attempt.id)
      ?? firstDate(attempt.submittedAt, attempt.submitted_at, attempt.createdAt)
      ?? `history-${byId.size}`;
    byId.set(key, attempt);
  }
  if (latest) {
    const key = asText(latest.attemptId)
      ?? asText(latest.id)
      ?? firstDate(latest.submittedAt, latest.submitted_at, latest.createdAt)
      ?? "latest";
    if (!byId.has(key)) byId.set(key, latest);
  }

  const attempts = [...byId.entries()]
    .map(([key, attempt]) => ({
      key,
      attempt,
      date: firstDate(
        attempt.submittedAt,
        attempt.submitted_at,
        attempt.completedAt,
        attempt.completed_at,
        attempt.createdAt,
        attempt.created_at,
      ) ?? "",
    }))
    .sort((left, right) => {
      const leftTime = Date.parse(left.date || "") || 0;
      const rightTime = Date.parse(right.date || "") || 0;
      return leftTime - rightTime;
    });

  const total = attempts.length;
  const taskTitle = asText(practical.taskTitle) ?? asText(practical.title) ?? "Practical task";

  return attempts.map(({ key, attempt, date }, index) => {
    const attemptNumber = index + 1;
    const scoreLabel = scoreLabelFrom(attempt);
    const passed = attempt.passed === true
      || attempt.status === "Passed"
      || asText(attempt.result)?.toLowerCase() === "passed";
    const status = asText(attempt.status) ?? (passed ? "Passed" : "Submitted");
    const attemptTitle = asText(attempt.title) ?? asText(attempt.taskTitle) ?? taskTitle;
    const retryLabel = attemptNumber === 1
      ? "First attempt"
      : `Retry ${attemptNumber - 1}`;

    return {
      id: `assessment:${key}:${date || "undated"}`,
      kind: "assessment" as const,
      title: `${attemptTitle} · Attempt ${attemptNumber} of ${total}`,
      detail: [
        retryLabel,
        scoreLabel ? `Score ${scoreLabel}` : null,
        status,
      ].filter(Boolean).join(" · "),
      date,
      verification: (passed ? "Verified" : "Shared") as JourneyVerification,
      skill,
      attemptNumber,
      attemptTotal: total,
      scoreLabel,
      outcome: status,
    };
  });
}

function lmsMilestones(payload: Record<string, unknown> | null | undefined, skill: string): JourneyMilestone[] {
  const evidence = evidencePackage(payload);
  const lms = asRecord(evidence.lms) ?? {};
  const rows = [
    ...asRecords(lms.grades).map((row) => ({ row, source: "grade" as const })),
    ...asRecords(lms.assignments).map((row) => ({ row, source: "assignment" as const })),
    ...asRecords(lms.courses).map((row) => ({ row, source: "course" as const })),
    ...asRecords(lms.evidence).map((row) => ({ row, source: "evidence" as const })),
    ...asRecords(lms.importedEvidence).map((row) => ({ row, source: "import" as const })),
  ];

  return rows.flatMap(({ row, source }, index) => {
    const date = firstDate(
      row.gradedAt,
      row.graded_at,
      row.completedAt,
      row.completed_at,
      row.submittedAt,
      row.submitted_at,
      row.importedAt,
      row.imported_at,
      row.createdAt,
      row.created_at,
    ) ?? "";
    const title = asText(row.activityName)
      ?? asText(row.assignmentName)
      ?? asText(row.courseName)
      ?? asText(row.title)
      ?? (source === "import" ? "LMS evidence imported" : "LMS achievement");
    const grade = row.grade ?? row.score;
    const score = grade != null ? String(grade) : null;
    return [{
      id: `lms:${source}:${asText(row.id) ?? index}:${date || "undated"}`,
      kind: (source === "import" ? "integration" : "achievement") as JourneyMilestoneKind,
      title,
      detail: score
        ? `LMS ${source} · Grade ${score}`
        : `LMS ${source} linked to this competency`,
      date,
      verification: "Shared" as JourneyVerification,
      skill,
      scoreLabel: score,
      outcome: source,
    }];
  });
}

function githubUrl(row: Record<string, unknown>): string | null {
  return asText(row.html_url)
    ?? asText(row.htmlUrl)
    ?? asText(row.github_url)
    ?? asText(row.githubUrl)
    ?? asText(row.url)
    ?? asText(row.repo_url)
    ?? asText(row.repoUrl);
}

function githubMilestones(payload: Record<string, unknown> | null | undefined, skill: string): JourneyMilestone[] {
  const evidence = evidencePackage(payload);
  const github = asRecord(evidence.github) ?? asRecord(payload?.github) ?? {};
  const milestones: JourneyMilestone[] = [];

  asRecords(github.repos).forEach((row, index) => {
    const repoName = asText(row.full_name) ?? asText(row.fullName) ?? asText(row.name) ?? asText(row.repo);
    const created = firstDate(row.created_at, row.createdAt, row.linkedAt, row.linked_at);
    const updated = firstDate(row.pushed_at, row.pushedAt, row.updated_at, row.updatedAt, row.last_commit_at);
    const url = githubUrl(row);
    const commits = asNumber(row.commit_count) ?? asNumber(row.commitCount);

    if (created) {
      milestones.push({
        id: `github:repo-created:${asText(row.id) ?? repoName ?? index}:${created}`,
        kind: "integration",
        title: repoName ? `Project created · ${repoName}` : "GitHub project created",
        detail: "Repository created on GitHub",
        date: created,
        verification: "Shared",
        skill,
        outcome: "repo-created",
        url,
      });
    }

    if (updated && updated !== created) {
      milestones.push({
        id: `github:repo-activity:${asText(row.id) ?? repoName ?? index}:${updated}`,
        kind: "integration",
        title: repoName ? `Repo activity · ${repoName}` : "GitHub repo activity",
        detail: commits != null
          ? `${commits} commits disclosed on this repository`
          : "Latest repository activity shared",
        date: updated,
        verification: "Shared",
        skill,
        outcome: "repo-activity",
        url,
      });
    } else if (!created && !updated) {
      milestones.push({
        id: `github:repo:${asText(row.id) ?? repoName ?? index}:undated`,
        kind: "integration",
        title: repoName ? `GitHub repo · ${repoName}` : "GitHub repo linked",
        detail: commits != null ? `${commits} commits disclosed` : "Repository linked to this competency",
        date: "",
        verification: "Shared",
        skill,
        outcome: "repo",
        url,
      });
    }
  });

  asRecords(github.activities).forEach((row, index) => {
    const date = firstDate(
      row.occurredAt,
      row.occurred_at,
      row.committedAt,
      row.committed_at,
      row.createdAt,
      row.created_at,
      row.date,
    ) ?? "";
    const repoName = asText(row.full_name) ?? asText(row.repo_name) ?? asText(row.repo) ?? asText(row.name);
    const activity = asText(row.activity_type) ?? asText(row.type) ?? asText(row.event) ?? "Commit";
    const message = asText(row.message) ?? asText(row.commit_message) ?? asText(row.title);
    milestones.push({
      id: `github:commit:${asText(row.id) ?? asText(row.sha) ?? index}:${date || "undated"}`,
      kind: "integration",
      title: repoName ? `${activity} · ${repoName}` : activity,
      detail: message ?? "GitHub commit / activity shared for this competency",
      date,
      verification: "Shared",
      skill,
      outcome: "commit",
      url: githubUrl(row),
    });
  });

  asRecords(github.evidenceRecords).forEach((row, index) => {
    const date = firstDate(
      row.linkedAt,
      row.linked_at,
      row.importedAt,
      row.imported_at,
      row.createdAt,
      row.created_at,
    ) ?? "";
    const repoName = asText(row.full_name) ?? asText(row.fullName) ?? asText(row.name);
    milestones.push({
      id: `github:evidence:${asText(row.id) ?? repoName ?? index}:${date || "undated"}`,
      kind: "integration",
      title: repoName ? `GitHub evidence · ${repoName}` : "GitHub evidence integrated",
      detail: "GitHub evidence package shared with recruiters",
      date,
      verification: "Shared",
      skill,
      outcome: "evidence",
      url: githubUrl(row),
    });
  });

  asRecords(github.reviews).forEach((row, index) => {
    const date = firstDate(row.reviewedAt, row.reviewed_at, row.createdAt, row.created_at) ?? "";
    milestones.push({
      id: `github:review:${asText(row.id) ?? index}:${date || "undated"}`,
      kind: "achievement",
      title: "GitHub review recorded",
      detail: "Peer or maintainer review from GitHub",
      date,
      verification: "Shared",
      skill,
      outcome: "review",
      url: githubUrl(row),
    });
  });

  return milestones;
}

function peerReviewMilestones(payload: Record<string, unknown> | null | undefined, skill: string): JourneyMilestone[] {
  const evidence = evidencePackage(payload);
  const reviews = [
    ...asRecords(evidence.peerReviews),
    ...asRecords(payload?.peerReviews),
  ];

  return reviews.flatMap((row, index) => {
    const date = firstDate(row.date, row.createdAt, row.created_at, row.reviewedAt, row.reviewed_at) ?? "";
    const reviewer = asText(row.reviewerName) ?? asText(row.reviewer_name) ?? "Peer reviewer";
    const trust = asText(row.trustWeight) ?? asText(row.trust_weight);
    return [{
      id: `review:${asText(row.id) ?? index}:${date || "undated"}`,
      kind: "achievement" as const,
      title: "Peer review received",
      detail: trust ? `${reviewer} · ${trust}` : `Review from ${reviewer}`,
      date,
      verification: (asText(row.contextStatus)?.toLowerCase().includes("verified")
        ? "Verified"
        : "Shared") as JourneyVerification,
      skill,
      outcome: trust,
    }];
  });
}

function institutionMilestones(payload: Record<string, unknown> | null | undefined, skill: string): JourneyMilestone[] {
  const evidence = evidencePackage(payload);
  const review = asRecord(evidence.institutionReview) ?? asRecord(payload?.institutionReview);
  if (!review) return [];
  const date = firstDate(review.reviewedAt, review.reviewed_at, review.createdAt, review.created_at) ?? "";
  const status = asText(review.status) ?? "Reviewed";
  const feedback = asText(review.feedback);
  return [{
    id: `institution:${date || "undated"}:${status}`,
    kind: "achievement" as const,
    title: "Institution review",
    detail: feedback ? `${status} · ${feedback}` : status,
    date,
    verification: (status.toLowerCase().includes("approved") || status.toLowerCase().includes("verified")
      ? "Verified"
      : "Shared") as JourneyVerification,
    skill,
    outcome: status,
  }];
}

function teacherFeedbackMilestones(payload: Record<string, unknown> | null | undefined, skill: string): JourneyMilestone[] {
  const evidence = evidencePackage(payload);
  const rows = [
    ...asRecords(evidence.teacherFeedback),
    ...asRecords(payload?.teacherFeedback),
  ];
  return rows.flatMap((row, index) => {
    const date = firstDate(row.createdAt, row.created_at, row.reviewedAt, row.reviewed_at, row.date) ?? "";
    const teacher = asText(row.teacherName) ?? asText(row.teacher_name) ?? "Teacher";
    const note = asText(row.feedback) ?? asText(row.comment) ?? asText(row.note);
    return [{
      id: `teacher:${asText(row.id) ?? index}:${date || "undated"}`,
      kind: "achievement" as const,
      title: "Teacher feedback",
      detail: note ? `${teacher} · ${note}` : `Feedback from ${teacher}`,
      date,
      verification: "Shared" as JourneyVerification,
      skill,
    }];
  });
}

function timestampIntegrationMilestones(
  payload: Record<string, unknown> | null | undefined,
  skill: string,
): JourneyMilestone[] {
  const evidence = evidencePackage(payload);
  const stamps = asRecord(evidence.evidenceTimestamps) ?? asRecord(payload?.evidenceTimestamps) ?? {};
  const groups: Array<{ key: string; label: string; values: unknown }> = [
    { key: "github", label: "GitHub evidence integrated", values: stamps.github },
    { key: "lms", label: "LMS evidence integrated", values: stamps.lms },
    { key: "practicalTask", label: "Practical task evidence integrated", values: stamps.practicalTask },
    { key: "peerReviews", label: "Peer review evidence integrated", values: stamps.peerReviews },
    { key: "teacherFeedback", label: "Teacher feedback integrated", values: stamps.teacherFeedback },
    { key: "externalEvidence", label: "External evidence integrated", values: stamps.externalEvidence },
  ];

  return groups.flatMap(({ key, label, values }) => {
    const dates = Array.isArray(values) ? values : [];
    return dates.flatMap((value, index) => {
      const date = firstDate(value) ?? "";
      if (!date) return [];
      return [{
        id: `stamp:${key}:${date}:${index}`,
        kind: "integration" as const,
        title: label,
        detail: "Evidence package timestamp shared with recruiters",
        date,
        verification: "Shared" as JourneyVerification,
        skill,
        outcome: key,
      }];
    });
  });
}

function withFallbackDate(
  milestones: JourneyMilestone[],
  fallbackDate: string | null | undefined,
): JourneyMilestone[] {
  if (!fallbackDate || Number.isNaN(Date.parse(fallbackDate))) return milestones;
  return milestones.map((item, index) => {
    if (item.date && !Number.isNaN(Date.parse(item.date))) return item;
    return {
      ...item,
      date: fallbackDate,
      id: `${item.id}:fallback:${index}`,
    };
  });
}

export function summarizeSkillJourney(milestones: JourneyMilestone[]): JourneySummary {
  const attempts = milestones.filter((item) => item.kind === "assessment");
  const scored = attempts
    .map((item) => item.scoreLabel)
    .filter((value): value is string => Boolean(value));
  return {
    milestoneCount: milestones.length,
    attemptCount: attempts.length,
    bestScoreLabel: scored[scored.length - 1] ?? scored[0] ?? null,
    firstDate: milestones[0]?.date ?? null,
    lastDate: milestones[milestones.length - 1]?.date ?? null,
  };
}

/**
 * Build a chronological skill journey from recruiter-visible shared data only.
 * Uses shared credentials, recorded competency versions, and disclosed evidence payloads.
 */
export function buildSkillJourneyTimeline(params: {
  skill: string;
  credentials: Array<{ id: string; skill: string; issuedAt: string; issuer?: string | null; status?: string | null }>;
  recordedVersions?: SharedCompetencyVersion[];
  disclosedPayload?: Record<string, unknown> | null;
  /** Used when evidence rows lack dates, and as a baseline shared milestone. */
  sharedAt?: string | null;
}): JourneyMilestone[] {
  const skill = params.skill.trim();
  if (!skill) return [];

  const sharedAt = params.sharedAt && !Number.isNaN(Date.parse(params.sharedAt))
    ? new Date(params.sharedAt).toISOString()
    : null;

  let milestones = [
    ...credentialMilestones(params.credentials, skill),
    ...recordedVersionMilestones(params.recordedVersions ?? [], skill),
    ...withFallbackDate(practicalMilestones(params.disclosedPayload, skill), sharedAt),
    ...withFallbackDate(lmsMilestones(params.disclosedPayload, skill), sharedAt),
    ...withFallbackDate(githubMilestones(params.disclosedPayload, skill), sharedAt),
    ...withFallbackDate(peerReviewMilestones(params.disclosedPayload, skill), sharedAt),
    ...withFallbackDate(institutionMilestones(params.disclosedPayload, skill), sharedAt),
    ...withFallbackDate(teacherFeedbackMilestones(params.disclosedPayload, skill), sharedAt),
    ...withFallbackDate(timestampIntegrationMilestones(params.disclosedPayload, skill), sharedAt),
  ];

  // Always surface the shared competency itself when the learner disclosed it.
  if (sharedAt && !milestones.some((item) => item.kind === "credential")) {
    milestones = [
      {
        id: `shared:${skill}:${sharedAt}`,
        kind: "credential",
        title: "Competency shared",
        detail: `${skill} disclosed with recruiters`,
        date: sharedAt,
        verification: "Shared",
        skill,
      },
      ...milestones,
    ];
  }

  const seen = new Set<string>();
  return milestones
    .filter((item) => {
      if (!item.date || Number.isNaN(Date.parse(item.date))) return false;
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .sort(sortByDateAsc);
}
