/**
 * Public credential / ATS resume helpers.
 * Maps a selective-disclosure payload into a resume + evidence ledger
 * without leaking fields the learner did not share.
 */

export type PublicShareStatus = "valid" | "revoked" | "expired" | "invalid";

export type TrustTier = "lms_preverified" | "corroborating";

export type TrustTierLabel = "LMS pre-verified" | "Corroborating";

export type EvidenceLedgerSource =
  | "lms"
  | "github"
  | "practical_task"
  | "peer_review"
  | "teacher_feedback";

export type AtsResumeExperience = {
  title: string;
  organization: string;
  detail: string;
  dates?: string;
};

export type AtsResumeEducation = {
  institution: string;
  program?: string;
  location?: string;
};

export type AtsResumeSkill = {
  competencyId: string;
  name: string;
  href: string;
  ledger?: EvidenceLedgerItem[];
};

export type AtsResumeCertification = {
  name: string;
  issuer?: string;
  issuedAt?: string;
};

export type AtsResumeView = {
  name: string;
  headline?: string;
  photoUrl?: string;
  contact: {
    email?: string;
    phone?: string;
    location?: string;
  };
  professionalSummary: string | null;
  workExperience: AtsResumeExperience[];
  education: AtsResumeEducation[];
  skills: AtsResumeSkill[];
  certifications: AtsResumeCertification[];
};

export type EvidenceLedgerItem = {
  id: string;
  source: EvidenceLedgerSource;
  title: string;
  detail: string;
  status: string | null;
  timestamp: string | null;
  url?: string | null;
  trustTier: TrustTier;
  trustTierLabel: TrustTierLabel;
};

export type PublicInspectorSource = "github" | "lms" | "task" | "reviews";

export type PublicInspectorView = {
  githubRepos: Array<{ name: string; language: string | null; commits: number | null; url: string | null }>;
  lmsAssignments: Array<{ name: string; course: string; grade: string }>;
  taskDetail: string | null;
  reviews: Array<{ reviewer: string; text: string }>;
  github: {
    repos: number;
    commits: number;
    activities: number;
    pullRequests: number;
    languages: string[];
    commitSeries: Array<{ label: string; commits: number }>;
  };
  lmsRows: Array<{
    id: string;
    name: string;
    assignments: number;
    scoreLabel: string;
    scorePercent: number | null;
  }>;
  verifyUrl: string | null;
  availableSources: PublicInspectorSource[];
};

export type PublicCredentialWebView = {
  disclosedPayload: Record<string, unknown>;
  proofType: string;
  verificationMethod: string | null;
  createdAt: string;
  expiresAt: string | null;
  payloadHash: string;
};

export type WalletExportAvailability = {
  apple: boolean;
  google: boolean;
};

export type PublicCredentialResponse = {
  status: PublicShareStatus;
  verified: boolean;
  verifiedAt: string | null;
  competencyId: string | null;
  selectedFields: string[];
  selectionMode: string;
  resume: AtsResumeView | null;
  webView: PublicCredentialWebView | null;
  walletExport: WalletExportAvailability;
};

export type PublicCompetencyResponse = {
  status: PublicShareStatus;
  verified: boolean;
  verifiedAt: string | null;
  competency: {
    competencyId: string;
    name: string;
    domain?: string;
    description?: string;
  } | null;
  ledger: EvidenceLedgerItem[] | null;
};

const ATS_HEADINGS = [
  "SUMMARY",
  "EDUCATION",
  "SKILLS",
  "ADDITIONAL INFORMATION",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNullableText(value: unknown): string | undefined {
  const text = asText(value);
  return text || undefined;
}

function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => isRecord(item))
    : [];
}

export function publicCredentialPath(shareToken: string): string {
  return `/credential/${encodeURIComponent(shareToken)}`;
}

export function publicCompetencyPath(shareToken: string, competencyId: string): string {
  return `/credential/${encodeURIComponent(shareToken)}/competency/${encodeURIComponent(competencyId)}`;
}

export function trustTierForSource(source: EvidenceLedgerSource): {
  trustTier: TrustTier;
  trustTierLabel: TrustTierLabel;
} {
  if (source === "lms" || source === "teacher_feedback") {
    return { trustTier: "lms_preverified", trustTierLabel: "LMS pre-verified" };
  }
  return { trustTier: "corroborating", trustTierLabel: "Corroborating" };
}

function learnerFromPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return isRecord(payload.learner) ? payload.learner : {};
}

function competencyFromPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return isRecord(payload.competency) ? payload.competency : {};
}

function evidenceFromPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return isRecord(payload.evidence) ? payload.evidence : {};
}

export function skillsFromPayload(
  payload: Record<string, unknown>,
  shareToken: string,
  fallbackCompetencyId?: string | null,
): AtsResumeSkill[] {
  const skills: AtsResumeSkill[] = [];
  const seen = new Set<string>();

  const push = (competencyId: string, name: string) => {
    const trimmed = name.trim();
    const key = `${competencyId}:${trimmed.toLowerCase()}`;
    if (!trimmed || seen.has(key)) return;
    seen.add(key);
    skills.push({
      competencyId,
      name: trimmed,
      href: publicCompetencyPath(shareToken, competencyId),
    });
  };

  for (const row of asRecords(payload.skills)) {
    const name = asText(row.name);
    const competencyId = asText(row.competencyId) || fallbackCompetencyId || name;
    if (name) push(competencyId, name);
  }

  const competency = competencyFromPayload(payload);
  const primaryName = asText(competency.name);
  if (primaryName) {
    push(asText(competency.competencyId) || fallbackCompetencyId || primaryName, primaryName);
  }

  return skills;
}

function workExperienceFromPayload(payload: Record<string, unknown>): AtsResumeExperience[] {
  const evidence = evidenceFromPayload(payload);
  const github = isRecord(evidence.github) ? evidence.github : {};
  const complete = isRecord(evidence.completeEvidencePackage) ? evidence.completeEvidencePackage : {};
  const completeGithub = isRecord(complete.github) ? complete.github : {};
  const repos = [...asRecords(github.repos), ...asRecords(completeGithub.repos)];
  const experience: AtsResumeExperience[] = [];
  const seen = new Set<string>();

  for (const repo of repos) {
    const organization = asText(repo.full_name) || asText(repo.repo_name) || asText(repo.name);
    if (!organization || seen.has(organization.toLowerCase())) continue;
    seen.add(organization.toLowerCase());
    const language = asText(repo.primary_language) || asText(repo.language);
    const commits = repo.commit_count != null ? `${repo.commit_count} commits` : "";
    experience.push({
      title: "Software project",
      organization,
      detail: [language, commits, asText(repo.description)].filter(Boolean).join(" · "),
      dates: asNullableText(repo.updated_at ?? repo.last_commit_at ?? repo.created_at),
    });
  }

  const lms = isRecord(evidence.lms) ? evidence.lms : {};
  const completeLms = isRecord(complete.lms) ? complete.lms : {};
  const courses = [...asRecords(lms.courses), ...asRecords(completeLms.courses)];
  for (const course of courses) {
    const organization = asText(course.fullname) || asText(course.shortname) || asText(course.course_name);
    if (!organization || seen.has(organization.toLowerCase())) continue;
    seen.add(organization.toLowerCase());
    experience.push({
      title: "Coursework",
      organization,
      detail: asText(course.summary) || "LMS-verified coursework",
    });
  }

  return experience;
}

function educationFromPayload(payload: Record<string, unknown>): AtsResumeEducation[] {
  const learner = learnerFromPayload(payload);
  const institution = asText(learner.institution);
  if (!institution) return [];
  return [{
    institution,
    program: asNullableText(learner.program),
    location: asNullableText(learner.cityCountry),
  }];
}

function certificationsFromPayload(payload: Record<string, unknown>): AtsResumeCertification[] {
  const rows = asRecords(payload.credentialMetadata);
  return rows.map((row) => ({
    name: asText(row.skill_name) || asText(row.name) || asText(row.title) || "Issued credential",
    issuer: asNullableText(row.issuer_name ?? row.issuer),
    issuedAt: asNullableText(row.issued_at ?? row.created_at),
  })).filter((item) => item.name);
}

function professionalSummaryFromPayload(payload: Record<string, unknown>): string | null {
  const learner = learnerFromPayload(payload);
  const parts = [asText(learner.careerGoal), asText(learner.skillsSummary)].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

const DEFAULT_EVIDENCE_FIELDS = [
  "lms_evidence",
  "github_evidence",
  "practical_task_result",
  "peer_reviews",
  "teacher_feedback",
  "complete_evidence_package",
];

const LEDGER_SOURCE_LABEL: Record<EvidenceLedgerSource, string> = {
  lms: "Moodle / LMS",
  github: "GitHub",
  practical_task: "Practical task",
  peer_review: "Peer review",
  teacher_feedback: "Teacher feedback",
};

export function formatLedgerLine(item: EvidenceLedgerItem): string {
  return [LEDGER_SOURCE_LABEL[item.source], item.title, item.detail, item.trustTierLabel]
    .filter(Boolean)
    .join(" · ");
}

export function buildAtsResume(
  payload: Record<string, unknown>,
  shareToken: string,
  fallbackCompetencyId?: string | null,
  selectedFields?: string[],
): AtsResumeView {
  const learner = learnerFromPayload(payload);
  const contact = isRecord(learner.contact) ? learner.contact : {};
  const fields = selectedFields?.length ? selectedFields : DEFAULT_EVIDENCE_FIELDS;
  const skills = skillsFromPayload(payload, shareToken, fallbackCompetencyId).map((skill) => ({
    ...skill,
    ledger: buildEvidenceLedger(payload, skill.competencyId, fields),
  }));
  const headline = asText(learner.program)
    || asText(competencyFromPayload(payload).domain)
    || skills[0]?.name
    || undefined;
  return {
    name: asText(learner.name) || "Learner",
    headline,
    photoUrl: learner.photoHidden === true
      ? undefined
      : asNullableText(learner.photoUrl ?? learner.avatarUrl ?? learner.avatar_url),
    contact: {
      email: asNullableText(contact.email ?? learner.email),
      phone: asNullableText(contact.phone ?? learner.phone ?? learner.contactNumber),
      location: asNullableText(learner.cityCountry),
    },
    professionalSummary: professionalSummaryFromPayload(payload),
    workExperience: workExperienceFromPayload(payload),
    education: educationFromPayload(payload),
    skills,
    certifications: certificationsFromPayload(payload),
  };
}

export function atsResumeToPlainText(resume: AtsResumeView): string {
  const lines: string[] = [];
  lines.push(resume.name);
  if (resume.headline) lines.push(resume.headline);
  const contact = [resume.contact.email, resume.contact.phone, resume.contact.location].filter(Boolean);
  if (contact.length) lines.push(contact.join(" | "));
  lines.push("");

  if (resume.professionalSummary) {
    lines.push("SUMMARY");
    lines.push(resume.professionalSummary);
    lines.push("");
  }

  if (resume.education.length) {
    lines.push("EDUCATION");
    for (const item of resume.education) {
      lines.push([item.program, item.institution, item.location].filter(Boolean).join(" — "));
    }
    lines.push("");
  }

  if (resume.skills.length) {
    lines.push("SKILLS");
    for (const skill of resume.skills) {
      lines.push(skill.name);
    }
    lines.push("");
  }

  if (resume.certifications.length) {
    lines.push("ADDITIONAL INFORMATION");
    for (const item of resume.certifications) {
      lines.push(`Certificates: ${[item.name, item.issuer, item.issuedAt].filter(Boolean).join(" — ")}`);
    }
  }

  return lines.join("\n").trim();
}

export function extractAtsHeadings(text: string): string[] {
  return ATS_HEADINGS.filter((heading) => text.includes(heading));
}

function itemTimestamp(row: Record<string, unknown>, allow: boolean): string | null {
  if (!allow) return null;
  return asNullableText(
    row.submitted_at
    ?? row.updated_at
    ?? row.created_at
    ?? row.reviewed_at
    ?? row.completed_at
    ?? row.timestamp,
  ) ?? null;
}

function ledgerItem(
  source: EvidenceLedgerSource,
  title: string,
  detail: string,
  status: string | null,
  timestamp: string | null,
  index: number,
  url?: string | null,
): EvidenceLedgerItem {
  const tier = trustTierForSource(source);
  return {
    id: `${source}-${index}-${title.slice(0, 24)}`,
    source,
    title,
    detail,
    status,
    timestamp,
    url: url || null,
    ...tier,
  };
}

export function buildEvidenceLedger(
  payload: Record<string, unknown>,
  competencyId: string,
  selectedFields: string[],
): EvidenceLedgerItem[] {
  const evidence = evidenceFromPayload(payload);
  const complete = isRecord(evidence.completeEvidencePackage) ? evidence.completeEvidencePackage : {};
  const allowTimestamps = selectedFields.includes("timestamps");
  const items: EvidenceLedgerItem[] = [];

  const skillRows = asRecords(payload.skills);
  const matchedSkill = skillRows.find((row) => asText(row.competencyId) === competencyId);
  const primaryId = asText(competencyFromPayload(payload).competencyId);
  const isPrimary = competencyId === primaryId || (!matchedSkill && Boolean(competencyId));
  const hasSkillSnapshot = isRecord(matchedSkill?.evidence);
  const skillEvidence = hasSkillSnapshot ? matchedSkill.evidence : {};
  const packageEvidence = isRecord(complete) && Object.keys(complete).length > 0
    ? complete
    : (hasSkillSnapshot ? skillEvidence : evidence);

  const snapshotLms = isRecord(skillEvidence.lms) ? skillEvidence.lms : {};
  const snapshotGithub = isRecord(skillEvidence.github) ? skillEvidence.github : {};
  const lms = Object.keys(snapshotLms).length > 0
    ? snapshotLms
    : (isRecord(packageEvidence.lms) ? packageEvidence.lms : {});
  const github = Object.keys(snapshotGithub).length > 0
    ? snapshotGithub
    : (isRecord(packageEvidence.github) ? packageEvidence.github : {});
  const includeLms = hasSkillSnapshot
    ? Object.keys(snapshotLms).length > 0
    : isPrimary && (selectedFields.includes("lms_evidence") || selectedFields.includes("complete_evidence_package"));
  const includeGithub = hasSkillSnapshot
    ? Object.keys(snapshotGithub).length > 0
    : isPrimary && (selectedFields.includes("github_evidence") || selectedFields.includes("complete_evidence_package"));
  const includeTask = hasSkillSnapshot
    ? Boolean(skillEvidence.practicalTask)
    : isPrimary && (selectedFields.includes("practical_task_result") || selectedFields.includes("complete_evidence_package"));
  const includeReviews = hasSkillSnapshot
    ? Boolean(skillEvidence.peerReviews)
    : isPrimary && (selectedFields.includes("peer_reviews") || selectedFields.includes("complete_evidence_package"));
  const includeTeacher = hasSkillSnapshot
    ? Boolean(skillEvidence.teacherFeedback)
    : isPrimary && (selectedFields.includes("teacher_feedback") || selectedFields.includes("complete_evidence_package"));

  if (includeLms) {
    const rows = [
      ...asRecords(lms.assignments),
      ...asRecords(lms.evidence),
      ...asRecords(lms.importedEvidence),
      ...asRecords(lms.grades),
    ];
    rows.forEach((row, index) => {
      const title = asText(row.assignment_name) || asText(row.name) || asText(row.activity_name) || "LMS evidence";
      const course = asText(row.course_name) || asText(row.fullname) || "LMS";
      const grade = row.grade != null
        ? (row.grade_max != null ? `Grade ${row.grade} / ${row.grade_max}` : `Grade ${row.grade}`)
        : "";
      items.push(ledgerItem(
        "lms",
        title,
        [course, grade].filter(Boolean).join(" · "),
        asNullableText(row.submission_status ?? row.status) ?? "LMS pre-verified",
        itemTimestamp(row, allowTimestamps || Boolean(row.grade)),
        index,
      ));
    });
  }

  if (includeGithub) {
    const rows = [
      ...asRecords(github.repos),
      ...asRecords(github.evidenceRecords),
      ...asRecords(github.activities),
    ];
    rows.forEach((row, index) => {
      const title = asText(row.full_name) || asText(row.repo_name) || asText(row.name) || asText(row.activity_type) || "GitHub evidence";
      const detail = [
        asText(row.primary_language) || asText(row.language),
        row.commit_count != null ? `${row.commit_count} commits` : "",
        asText(row.description),
      ].filter(Boolean).join(" · ");
      items.push(ledgerItem(
        "github",
        title,
        detail || "GitHub activity linked to this competency",
        asNullableText(row.status) ?? "Synced",
        itemTimestamp(row, allowTimestamps),
        index,
        asNullableText(row.html_url ?? row.github_url ?? row.url ?? row.repo_url) ?? null,
      ));
    });
  }

  if (includeTask) {
    const practical = isRecord(packageEvidence.practicalTask)
      ? packageEvidence.practicalTask
      : (isRecord(skillEvidence.practicalTask) ? skillEvidence.practicalTask : {});
    const attempts = [
      ...(isRecord(practical.latestAttempt) ? [practical.latestAttempt] : []),
      ...asRecords(practical.attemptHistory),
    ];
    attempts.forEach((row, index) => {
      const title = asText(row.title) || "Practical task";
      const score = row.scorePercent != null ? `${row.scorePercent}%` : "";
      items.push(ledgerItem(
        "practical_task",
        title,
        [score, asText(row.status)].filter(Boolean).join(" · ") || "Practical task result",
        asNullableText(row.status) ?? (row.passed === true ? "Passed" : "Submitted"),
        itemTimestamp(row, allowTimestamps || Boolean(row.submittedAt) || Boolean(row.submitted_at)),
        index,
      ));
    });
  }

  if (includeReviews) {
    const reviews = [
      ...asRecords(packageEvidence.peerReviews),
      ...asRecords(skillEvidence.peerReviews),
      ...asRecords(evidence.peerReviews),
    ];
    reviews.forEach((row, index) => {
      items.push(ledgerItem(
        "peer_review",
        asText(row.reviewer_name) || asText(row.reviewer) || "Peer review",
        asText(row.review_text) || asText(row.comment) || "Peer review submitted",
        asNullableText(row.status) ?? "Reviewed",
        itemTimestamp(row, allowTimestamps),
        index,
      ));
    });
  }

  if (includeTeacher) {
    const feedback = [
      ...asRecords(packageEvidence.teacherFeedback),
      ...asRecords(skillEvidence.teacherFeedback),
      ...asRecords(evidence.teacherFeedback),
    ];
    feedback.forEach((row, index) => {
      items.push(ledgerItem(
        "teacher_feedback",
        asText(row.source) || asText(row.assignment_name) || "Teacher feedback",
        asText(row.feedback_text) || asText(row.comment) || "Feedback recorded",
        asNullableText(row.status) ?? "LMS pre-verified",
        itemTimestamp(row, allowTimestamps),
        index,
      ));
    });
  }

  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.source}:${item.title}:${item.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseGithubDetail(detail: string): { language: string | null; commits: number | null } {
  const commitsMatch = detail.match(/(\d+)\s+commits/i);
  const first = detail.split("·")[0]?.trim() ?? "";
  const language = first && !/github activity/i.test(first) && !/commits/i.test(first)
    ? first
    : null;
  return {
    language,
    commits: commitsMatch ? Number(commitsMatch[1]) : null,
  };
}

function parseLmsDetail(detail: string): { course: string; grade: string } {
  const parts = detail.split("·").map((part) => part.trim()).filter(Boolean);
  return {
    course: parts[0] || "LMS",
    grade: parts.slice(1).join(" · ") || "—",
  };
}

function parseScore(value: string): number | null {
  const match = value.match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

export function inspectorViewFromLedger(items: EvidenceLedgerItem[]): PublicInspectorView {
  const githubItems = items.filter((item) => item.source === "github");
  const lmsItems = items.filter((item) => item.source === "lms");
  const taskItems = items.filter((item) => item.source === "practical_task");
  const reviewItems = items.filter((item) => item.source === "peer_review");

  const githubRepos = githubItems.map((item) => {
    const parsed = parseGithubDetail(item.detail);
    return {
      name: item.title,
      language: parsed.language,
      commits: parsed.commits,
      url: item.url ?? null,
    };
  });

  const lmsAssignments = lmsItems.map((item) => {
    const parsed = parseLmsDetail(item.detail);
    return {
      name: item.title,
      course: parsed.course,
      grade: parsed.grade,
    };
  });

  const task = taskItems[0];
  const taskDetail = task ? (task.detail || task.status) : null;

  const reviews = reviewItems.map((item) => ({
    reviewer: item.title,
    text: item.detail,
  }));

  const languages = [...new Set(githubRepos.map((repo) => repo.language).filter((value): value is string => Boolean(value)))];
  const commits = githubRepos.reduce((total, repo) => total + (repo.commits ?? 0), 0);

  const lmsByCourse = new Map<string, { name: string; assignments: number; scores: number[] }>();
  for (const row of lmsAssignments) {
    const existing = lmsByCourse.get(row.course) ?? { name: row.course, assignments: 0, scores: [] };
    existing.assignments += 1;
    const score = parseScore(row.grade);
    if (score != null) existing.scores.push(score);
    lmsByCourse.set(row.course, existing);
  }

  const lmsRows = [...lmsByCourse.entries()].map(([id, row]) => {
    const avg = row.scores.length
      ? Math.round(row.scores.reduce((sum, value) => sum + value, 0) / row.scores.length)
      : null;
    return {
      id,
      name: row.name,
      assignments: row.assignments,
      scoreLabel: avg != null ? String(avg) : "Linked",
      scorePercent: avg,
    };
  });

  const availableSources: PublicInspectorSource[] = [];
  if (githubRepos.length > 0) availableSources.push("github");
  if (lmsAssignments.length > 0) availableSources.push("lms");
  if (taskDetail) availableSources.push("task");
  if (reviews.length > 0) availableSources.push("reviews");
  if (availableSources.length === 0) availableSources.push("github");

  return {
    githubRepos,
    lmsAssignments,
    taskDetail,
    reviews,
    github: {
      repos: githubRepos.length,
      commits,
      activities: 0,
      pullRequests: 0,
      languages,
      commitSeries: [],
    },
    lmsRows,
    verifyUrl: githubRepos.find((repo) => repo.url)?.url ?? null,
    availableSources,
  };
}

export function competencyFromSharePayload(
  payload: Record<string, unknown>,
  competencyId: string,
  fallbackCompetencyId?: string | null,
): PublicCompetencyResponse["competency"] {
  const skill = asRecords(payload.skills).find((row) => asText(row.competencyId) === competencyId);
  if (skill && asText(skill.name)) {
    return {
      competencyId,
      name: asText(skill.name),
      domain: asNullableText(skill.domain),
      description: asNullableText(skill.description),
    };
  }

  const competency = competencyFromPayload(payload);
  const primaryId = asText(competency.competencyId) || fallbackCompetencyId;
  if (primaryId === competencyId && asText(competency.name)) {
    return {
      competencyId,
      name: asText(competency.name),
      domain: asNullableText(competency.domain),
      description: asNullableText(competency.description),
    };
  }

  return null;
}
