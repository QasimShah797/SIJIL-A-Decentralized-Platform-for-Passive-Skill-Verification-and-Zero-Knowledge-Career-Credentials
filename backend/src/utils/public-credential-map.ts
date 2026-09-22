import type {
  AtsResumeView,
  EvidenceLedgerItem,
  EvidenceLedgerSource,
  PublicCompetencyResponse,
} from "../types/public-credential.types";

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

export function publicCompetencyPath(shareToken: string, competencyId: string): string {
  return `/credential/${encodeURIComponent(shareToken)}/competency/${encodeURIComponent(competencyId)}`;
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

function trustTierForSource(source: EvidenceLedgerSource): Pick<EvidenceLedgerItem, "trustTier" | "trustTierLabel"> {
  if (source === "lms" || source === "teacher_feedback") {
    return { trustTier: "lms_preverified", trustTierLabel: "LMS pre-verified" };
  }
  return { trustTier: "corroborating", trustTierLabel: "Corroborating" };
}

export function skillsFromPayload(
  payload: Record<string, unknown>,
  shareToken: string,
  fallbackCompetencyId?: string | null,
): AtsResumeView["skills"] {
  const skills: AtsResumeView["skills"] = [];
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

function attachSkillLedgers(
  skills: AtsResumeView["skills"],
  payload: Record<string, unknown>,
  selectedFields?: string[],
): AtsResumeView["skills"] {
  const fields = selectedFields?.length ? selectedFields : DEFAULT_EVIDENCE_FIELDS;
  return skills.map((skill) => ({
    ...skill,
    ledger: buildEvidenceLedger(payload, skill.competencyId, fields),
  }));
}

export function buildAtsResume(
  payload: Record<string, unknown>,
  shareToken: string,
  fallbackCompetencyId?: string | null,
  selectedFields?: string[],
): AtsResumeView {
  const learner = learnerFromPayload(payload);
  const contact = isRecord(learner.contact) ? learner.contact : {};
  const evidence = evidenceFromPayload(payload);
  const github = isRecord(evidence.github) ? evidence.github : {};
  const complete = isRecord(evidence.completeEvidencePackage) ? evidence.completeEvidencePackage : {};
  const completeGithub = isRecord(complete.github) ? complete.github : {};
  const repos = [...asRecords(github.repos), ...asRecords(completeGithub.repos)];
  const workExperience: AtsResumeView["workExperience"] = [];
  const seen = new Set<string>();

  for (const repo of repos) {
    const organization = asText(repo.full_name) || asText(repo.repo_name) || asText(repo.name);
    if (!organization || seen.has(organization.toLowerCase())) continue;
    seen.add(organization.toLowerCase());
    const language = asText(repo.primary_language) || asText(repo.language);
    const commits = repo.commit_count != null ? `${repo.commit_count} commits` : "";
    workExperience.push({
      title: "Software project",
      organization,
      detail: [language, commits, asText(repo.description)].filter(Boolean).join(" · "),
      dates: asNullableText(repo.updated_at ?? repo.last_commit_at ?? repo.created_at),
    });
  }

  const lms = isRecord(evidence.lms) ? evidence.lms : {};
  const completeLms = isRecord(complete.lms) ? complete.lms : {};
  for (const course of [...asRecords(lms.courses), ...asRecords(completeLms.courses)]) {
    const organization = asText(course.fullname) || asText(course.shortname) || asText(course.course_name);
    if (!organization || seen.has(organization.toLowerCase())) continue;
    seen.add(organization.toLowerCase());
    workExperience.push({
      title: "Coursework",
      organization,
      detail: asText(course.summary) || "LMS-verified coursework",
    });
  }

  const institution = asText(learner.institution);
  const education = institution
    ? [{
        institution,
        program: asNullableText(learner.program),
        location: asNullableText(learner.cityCountry),
      }]
    : [];

  const certifications = asRecords(payload.credentialMetadata).map((row) => ({
    name: asText(row.skill_name) || asText(row.name) || asText(row.title) || "Issued credential",
    issuer: asNullableText(row.issuer_name ?? row.issuer),
    issuedAt: asNullableText(row.issued_at ?? row.created_at),
  })).filter((item) => item.name);

  const summary = [asText(learner.careerGoal), asText(learner.skillsSummary)].filter(Boolean).join(" ");
  const skills = attachSkillLedgers(
    skillsFromPayload(payload, shareToken, fallbackCompetencyId),
    payload,
    selectedFields,
  );

  return {
    name: asText(learner.name) || "Learner",
    headline: asText(learner.program) || asText(competencyFromPayload(payload).domain) || skills[0]?.name || undefined,
    photoUrl: learner.photoHidden === true
      ? undefined
      : asNullableText(learner.photoUrl ?? learner.avatarUrl ?? learner.avatar_url),
    contact: {
      email: asNullableText(contact.email ?? learner.email),
      phone: asNullableText(contact.phone ?? learner.phone ?? learner.contactNumber),
      location: asNullableText(learner.cityCountry),
    },
    professionalSummary: summary || null,
    workExperience,
    education,
    skills,
    certifications,
  };
}

export function atsResumeToPlainText(resume: AtsResumeView): string {
  const lines: string[] = [resume.name];
  if (resume.headline) lines.push(resume.headline);
  const contact = [resume.contact.email, resume.contact.phone, resume.contact.location].filter(Boolean);
  if (contact.length) lines.push(contact.join(" | "));
  lines.push("");

  if (resume.professionalSummary) {
    lines.push("SUMMARY", resume.professionalSummary, "");
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
    for (const skill of resume.skills) lines.push(skill.name);
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

function itemTimestamp(row: Record<string, unknown>, allow: boolean): string | null {
  if (!allow) return null;
  return asNullableText(
    row.submitted_at
    ?? row.updated_at
    ?? row.created_at
    ?? row.reviewed_at
    ?? row.completed_at
    ?? row.timestamp
    ?? row.submittedAt,
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
  return {
    id: `${source}-${index}-${title.slice(0, 24)}`,
    source,
    title,
    detail,
    status,
    timestamp,
    url: url || null,
    ...trustTierForSource(source),
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

  const matchedSkill = asRecords(payload.skills).find((row) => asText(row.competencyId) === competencyId);
  const primaryId = asText(competencyFromPayload(payload).competencyId);
  const isPrimary = competencyId === primaryId || (!matchedSkill && Boolean(competencyId));
  const hasSkillSnapshot = isRecord(matchedSkill?.evidence);
  const skillEvidence = hasSkillSnapshot ? matchedSkill.evidence : {};
  const packageEvidence = Object.keys(complete).length > 0
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
    [
      ...asRecords(lms.assignments),
      ...asRecords(lms.evidence),
      ...asRecords(lms.importedEvidence),
      ...asRecords(lms.grades),
    ].forEach((row, index) => {
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
        itemTimestamp(row, allowTimestamps || row.grade != null),
        index,
      ));
    });
  }

  if (includeGithub) {
    [
      ...asRecords(github.repos),
      ...asRecords(github.evidenceRecords),
      ...asRecords(github.activities),
    ].forEach((row, index) => {
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
      items.push(ledgerItem(
        "practical_task",
        asText(row.title) || "Practical task",
        [row.scorePercent != null ? `${row.scorePercent}%` : "", asText(row.status)].filter(Boolean).join(" · ")
          || "Practical task result",
        asNullableText(row.status) ?? (row.passed === true ? "Passed" : "Submitted"),
        itemTimestamp(row, allowTimestamps || Boolean(row.submittedAt ?? row.submitted_at)),
        index,
      ));
    });
  }

  if (includeReviews) {
    [
      ...asRecords(packageEvidence.peerReviews),
      ...asRecords(skillEvidence.peerReviews),
      ...asRecords(evidence.peerReviews),
    ].forEach((row, index) => {
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
    [
      ...asRecords(packageEvidence.teacherFeedback),
      ...asRecords(skillEvidence.teacherFeedback),
      ...asRecords(evidence.teacherFeedback),
    ].forEach((row, index) => {
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
