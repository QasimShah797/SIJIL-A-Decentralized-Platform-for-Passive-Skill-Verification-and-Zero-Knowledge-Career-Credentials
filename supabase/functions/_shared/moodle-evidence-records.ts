/**
 * Maps synced Moodle assignment data into evidence_records + skill_evidence_links.
 * Phase 1 Option B: match declared competencies using title/course/tags + intro + submission text.
 * Deterministic only — no AI. Instructions alone are relevance, not verified proof.
 *
 * Keep in sync with src/lib/moodle-competency-content-matching.ts
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

export type DeclaredSkillRef = { id: string; name: string };

export type MoodleMatchBasis =
  | "title"
  | "course"
  | "tags"
  | "intro"
  | "submission";

export type MoodleCompetencyMatch = {
  skill: DeclaredSkillRef;
  basis: MoodleMatchBasis[];
  introOnlyRelevance: boolean;
  score: number;
  submissionLanguageConflict: boolean;
};

export type MoodleEvidenceRepairResult = {
  assignmentsFound: number;
  evidenceCreated: number;
  evidenceUpdated: number;
  skillLinksCreated: number;
  unmatchedAssignments: number;
  logs: string[];
};

const MOODLE_CONTENT_MATCH_MAX_CHARS = 8_000;
const LIVE_MOODLE_SITE_URL = "https://sijil-lms.duckdns.org";

const BASIS_WEIGHT: Record<MoodleMatchBasis, number> = {
  submission: 100,
  title: 40,
  tags: 40,
  intro: 20,
  course: 10,
};

const PROGRAMMING_LANGUAGE_SKILLS = new Set([
  "java", "javascript", "js", "typescript", "ts", "python", "py",
  "c++", "cpp", "c#", "csharp", "c", "go", "golang", "rust",
  "kotlin", "swift", "ruby", "php", "r",
]);

function normalizedCompetencyText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim()
    .toLowerCase();
}

export function moodleHtmlToPlainText(raw: unknown, maxChars = MOODLE_CONTENT_MATCH_MAX_CHARS): string {
  if (raw == null) return "";
  const asString = typeof raw === "string" ? raw : String(raw);
  return asString
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) && code > 31 ? String.fromCharCode(code) : " ";
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => {
      const code = parseInt(h, 16);
      return Number.isFinite(code) && code > 31 ? String.fromCharCode(code) : " ";
    })
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars);
}

function candidatePlainText(candidate: unknown): string {
  if (typeof candidate === "string" && candidate.trim()) {
    return moodleHtmlToPlainText(candidate);
  }
  if (candidate && typeof candidate === "object") {
    const text = (candidate as Record<string, unknown>).text;
    if (typeof text === "string" && text.trim()) {
      return moodleHtmlToPlainText(text);
    }
  }
  return "";
}

export function extractMoodleAssignmentIntroText(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const row = raw as Record<string, unknown>;

  if (typeof row.intro_text === "string" && row.intro_text.trim()) {
    return moodleHtmlToPlainText(row.intro_text);
  }

  const assign = row.assign && typeof row.assign === "object"
    ? (row.assign as Record<string, unknown>)
    : null;
  const modAssign = (
    (row.modAssign && typeof row.modAssign === "object" ? row.modAssign : null)
    || (assign?.modAssign && typeof assign.modAssign === "object" ? assign.modAssign : null)
  ) as Record<string, unknown> | null;

  const buckets: Array<Record<string, unknown> | null> = [modAssign, assign, row];
  const fieldNames = ["intro", "description", "introeditor"] as const;

  for (const bucket of buckets) {
    if (!bucket) continue;
    for (const field of fieldNames) {
      const plain = candidatePlainText(bucket[field]);
      if (plain) return plain;
    }
    if (bucket.modAssign && typeof bucket.modAssign === "object") {
      const nested = bucket.modAssign as Record<string, unknown>;
      for (const field of fieldNames) {
        const plain = candidatePlainText(nested[field]);
        if (plain) return plain;
      }
    }
  }

  return "";
}

export function isProgrammingLanguageSkill(competencyName: string): boolean {
  return PROGRAMMING_LANGUAGE_SKILLS.has(normalizedCompetencyText(competencyName));
}

export function matchesCompetency(value: unknown, competencyName: string): boolean {
  const text = normalizedCompetencyText(value);
  const skill = normalizedCompetencyText(competencyName);
  if (!text || !skill) return false;

  const token = (pattern: string) => new RegExp(`(?:^|[^a-z0-9_])(?:${pattern})(?=[^a-z0-9_]|$)`, "i");

  if (skill === "java") return token("java(?!script)").test(text);
  if (skill === "javascript" || skill === "js") {
    return token("javascript").test(text) || token("node\\.?js").test(text) || token("js").test(text);
  }
  if (skill === "typescript" || skill === "ts") {
    return token("typescript").test(text) || token("ts").test(text);
  }
  if (skill === "c++" || skill === "cpp") {
    return token("c\\+\\+").test(text) || token("cpp").test(text);
  }
  if (skill === "c#" || skill === "csharp") {
    return token("c#").test(text) || token("csharp").test(text);
  }
  if (skill === "c") return token("c(?!\\+\\+|#|ss|at)").test(text);
  if (skill === "python" || skill === "py") {
    return token("python").test(text) || token("py").test(text);
  }
  if (skill === "go" || skill === "golang") {
    return token("golang").test(text) || token("go(?:lang)?").test(text);
  }
  if (skill === "r") return token("r").test(text);

  return text === skill || text.includes(skill) || skill.includes(text);
}

export function detectProgrammingLanguagesInText(haystack: unknown): string[] {
  const text = normalizedCompetencyText(haystack);
  if (!text) return [];
  const found: string[] = [];
  const checks: Array<[string, () => boolean]> = [
    ["java", () => matchesCompetency(text, "Java")],
    ["javascript", () => matchesCompetency(text, "JavaScript")],
    ["typescript", () => matchesCompetency(text, "TypeScript")],
    ["python", () => matchesCompetency(text, "Python")],
    ["c++", () => matchesCompetency(text, "C++")],
    ["c#", () => matchesCompetency(text, "C#")],
    ["go", () => matchesCompetency(text, "Go")],
    ["rust", () => /(?:^|[^a-z0-9_])rust(?=[^a-z0-9_]|$)/i.test(text)],
    ["kotlin", () => /(?:^|[^a-z0-9_])kotlin(?=[^a-z0-9_]|$)/i.test(text)],
    ["php", () => /(?:^|[^a-z0-9_])php(?=[^a-z0-9_]|$)/i.test(text)],
    ["ruby", () => /(?:^|[^a-z0-9_])ruby(?=[^a-z0-9_]|$)/i.test(text)],
    ["swift", () => /(?:^|[^a-z0-9_])swift(?=[^a-z0-9_]|$)/i.test(text)],
    ["c", () => matchesCompetency(text, "C")],
    ["r", () => matchesCompetency(text, "R")],
  ];
  for (const [lang, test] of checks) {
    if (test()) found.push(lang);
  }
  return found;
}

function canonicalLanguageKey(skillName: string): string {
  const skill = normalizedCompetencyText(skillName);
  if (skill === "js" || skill === "javascript") return "javascript";
  if (skill === "ts" || skill === "typescript") return "typescript";
  if (skill === "py" || skill === "python") return "python";
  if (skill === "cpp" || skill === "c++") return "c++";
  if (skill === "csharp" || skill === "c#") return "c#";
  if (skill === "golang" || skill === "go") return "go";
  return skill;
}

export function matchesCompetencyTags(tags: unknown, competencyName: string): boolean {
  if (!Array.isArray(tags)) return false;
  return tags.some((tag) => {
    if (typeof tag === "string") return matchesCompetency(tag, competencyName);
    if (tag && typeof tag === "object") {
      const row = tag as Record<string, unknown>;
      return matchesCompetency(row.name, competencyName)
        || matchesCompetency(row.shortname, competencyName)
        || matchesCompetency(row.label, competencyName);
    }
    return false;
  });
}

function collectBasis(
  skillName: string,
  params: {
    courseName?: string | null;
    courseShortname?: string | null;
    assignmentName?: string | null;
    competencyTags?: unknown;
    assignmentIntro?: string | null;
    submissionText?: string | null;
  },
): MoodleMatchBasis[] {
  const basis: MoodleMatchBasis[] = [];
  if (matchesCompetency(params.assignmentName, skillName)) basis.push("title");
  if (
    matchesCompetency(params.courseName, skillName)
    || matchesCompetency(params.courseShortname, skillName)
  ) {
    basis.push("course");
  }
  if (matchesCompetencyTags(params.competencyTags, skillName)) basis.push("tags");
  if (matchesCompetency(params.assignmentIntro, skillName)) basis.push("intro");
  if (matchesCompetency(params.submissionText, skillName)) basis.push("submission");
  return basis;
}

function scoreBasis(basis: MoodleMatchBasis[]): number {
  return basis.reduce((sum, key) => sum + (BASIS_WEIGHT[key] ?? 0), 0);
}

function hasSubmissionLanguageConflict(
  skillName: string,
  submissionText: string | null | undefined,
): boolean {
  if (!isProgrammingLanguageSkill(skillName)) return false;
  const submission = typeof submissionText === "string" ? submissionText.trim() : "";
  if (!submission) return false;
  if (matchesCompetency(submission, skillName)) return false;

  const detected = detectProgrammingLanguagesInText(submission);
  if (detected.length === 0) return false;

  const skillKey = canonicalLanguageKey(skillName);
  return detected.some((lang) => lang !== skillKey);
}

export function sortDeclaredSkillsDeterministically(
  skills: DeclaredSkillRef[],
): DeclaredSkillRef[] {
  return [...skills].sort((a, b) => {
    const nameCmp = normalizedCompetencyText(a.name).localeCompare(normalizedCompetencyText(b.name));
    if (nameCmp !== 0) return nameCmp;
    return String(a.id).localeCompare(String(b.id));
  });
}

export function resolveCompetencyForMoodleAssignment(
  skills: DeclaredSkillRef[],
  params: {
    courseName?: string | null;
    courseShortname?: string | null;
    assignmentName?: string | null;
    competencyTags?: unknown;
    assignmentIntro?: string | null;
    submissionText?: string | null;
  },
): MoodleCompetencyMatch | null {
  const ordered = sortDeclaredSkillsDeterministically(skills);
  let best: MoodleCompetencyMatch | null = null;

  for (const skill of ordered) {
    const basis = collectBasis(skill.name, params);
    if (basis.length === 0) continue;

    const score = scoreBasis(basis);
    const introOnlyRelevance = basis.length === 1 && basis[0] === "intro";
    const submissionLanguageConflict = hasSubmissionLanguageConflict(
      skill.name,
      params.submissionText,
    );
    const candidate: MoodleCompetencyMatch = {
      skill,
      basis,
      introOnlyRelevance,
      score,
      submissionLanguageConflict,
    };

    if (!best) {
      best = candidate;
      continue;
    }
    if (candidate.score > best.score) {
      best = candidate;
      continue;
    }
    if (candidate.score === best.score) {
      const bestHasSubmission = best.basis.includes("submission");
      const candidateHasSubmission = candidate.basis.includes("submission");
      if (candidateHasSubmission && !bestHasSubmission) {
        best = candidate;
      }
    }
  }

  return best;
}

export function hasMoodlePerformanceEvidence(params: {
  grade?: number | null;
  submissionText?: string | null;
}): boolean {
  if (params.grade != null && Number.isFinite(params.grade)) return true;
  return Boolean(params.submissionText && params.submissionText.trim().length >= 12);
}

export function canCreateVerifiedMoodleEvidence(params: {
  match: MoodleCompetencyMatch | null;
  grade?: number | null;
  submissionText?: string | null;
  requireGrade?: boolean;
}): boolean {
  if (!params.match) return false;

  const requireGrade = params.requireGrade !== false;
  if (requireGrade && (params.grade == null || !Number.isFinite(params.grade))) {
    return false;
  }

  if (params.match.submissionLanguageConflict) {
    return false;
  }

  const basis = params.match.basis;
  const hasSubmissionBasis = basis.includes("submission");
  const hasStrongNonIntroBasis = basis.includes("title") || basis.includes("tags");
  const instructionalOnly =
    !hasSubmissionBasis
    && !hasStrongNonIntroBasis
    && (basis.includes("intro") || basis.includes("course"));

  const skillIsLanguage = isProgrammingLanguageSkill(params.match.skill.name);
  const submission = typeof params.submissionText === "string" ? params.submissionText.trim() : "";
  const submissionInconclusive = !submission
    || (
      skillIsLanguage
      && !hasSubmissionBasis
      && detectProgrammingLanguagesInText(submission).length === 0
    );

  if (skillIsLanguage && instructionalOnly) {
    return false;
  }

  if (skillIsLanguage && !hasSubmissionBasis && submissionInconclusive && !hasStrongNonIntroBasis) {
    return false;
  }

  if (params.match.introOnlyRelevance && !hasSubmissionBasis) {
    return false;
  }

  return true;
}

export function moodleAssignmentExternalId(moodleAssignmentId: number | string): string {
  return `moodle_assignment_${moodleAssignmentId}`;
}

function gradePercentage(grade: number | null, gradeMax: number | null): number | null {
  if (grade == null || gradeMax == null || gradeMax <= 0) return null;
  return Math.round((grade / gradeMax) * 100);
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function buildLmsEvidenceMetadata(params: {
  moodleCourseId: number;
  moodleAssignmentId: number;
  courseName: string;
  assignmentName: string;
  grade: number | null;
  gradeMax: number | null;
  teacherFeedback?: string | null;
  matchBasis?: MoodleMatchBasis[];
  introOnlyRelevance?: boolean;
  submissionLanguageConflict?: boolean;
  matchScore?: number;
}): Record<string, unknown> {
  return {
    platform: "Moodle",
    course_name: params.courseName,
    assignment_name: params.assignmentName,
    grade: params.grade,
    grade_max: params.gradeMax,
    grade_percentage: gradePercentage(params.grade, params.gradeMax),
    teacher_feedback: params.teacherFeedback ?? null,
    moodle_course_id: params.moodleCourseId,
    moodle_assignment_id: params.moodleAssignmentId,
    match_basis: params.matchBasis ?? null,
    intro_only_relevance: params.introOnlyRelevance ?? false,
    submission_language_conflict: params.submissionLanguageConflict ?? false,
    match_score: params.matchScore ?? null,
    content_match_phase: "phase1_option_b",
  };
}

function logMoodleRepair(
  assignmentName: string,
  matchedCompetency: string | null,
  evidenceId: string | null,
): void {
  console.log("[moodle-repair]", assignmentName, matchedCompetency ?? "—", evidenceId ?? "—");
}

export async function upsertMoodleAssignmentEvidenceRecord(
  admin: SupabaseClient,
  params: {
    userId: string;
    skill: DeclaredSkillRef;
    moodleSiteUrl: string;
    moodleCourseId: number;
    moodleAssignmentId: number;
    courseName: string;
    assignmentName: string;
    grade: number | null;
    gradeMax: number | null;
    teacherFeedback?: string | null;
    syncedAt?: string;
    requireGrade?: boolean;
    matchBasis?: MoodleMatchBasis[];
    introOnlyRelevance?: boolean;
    submissionText?: string | null;
    submissionLanguageConflict?: boolean;
    matchScore?: number;
  },
): Promise<{ evidenceRecordId: string | null; created: boolean; updated: boolean }> {
  const match: MoodleCompetencyMatch = {
    skill: params.skill,
    basis: params.matchBasis ?? [],
    introOnlyRelevance: Boolean(params.introOnlyRelevance),
    score: params.matchScore ?? 0,
    submissionLanguageConflict: Boolean(params.submissionLanguageConflict),
  };

  const eligibleVerified = canCreateVerifiedMoodleEvidence({
    match,
    grade: params.grade,
    submissionText: params.submissionText,
    requireGrade: params.requireGrade !== false,
  });

  const externalId = moodleAssignmentExternalId(params.moodleAssignmentId);

  const { data: existing, error: existingError } = await admin
    .from("evidence_records")
    .select("id, status")
    .eq("user_id", params.userId)
    .eq("external_id", externalId)
    .eq("source", "LMS")
    .maybeSingle();

  if (existingError) {
    console.error("[moodle-repair] existing lookup failed:", existingError.message);
  }

  // Preserve historical verified rows — do not silently downgrade or remap on failed re-eval.
  if (existing?.id && String(existing.status) === "verified" && !eligibleVerified) {
    logMoodleRepair(params.assignmentName, params.skill.name, String(existing.id));
    return { evidenceRecordId: String(existing.id), created: false, updated: false };
  }

  if (params.requireGrade !== false && !eligibleVerified) {
    return { evidenceRecordId: null, created: false, updated: false };
  }

  // Repair path may create pending relevance rows only when not conflicted.
  if (params.requireGrade === false && !eligibleVerified) {
    if (params.submissionLanguageConflict || match.introOnlyRelevance) {
      return { evidenceRecordId: null, created: false, updated: false };
    }
  }

  const now = params.syncedAt ?? new Date().toISOString();
  const metadata = buildLmsEvidenceMetadata(params);
  const status = eligibleVerified ? "verified" : "pending";

  const corePayload = {
    user_id: params.userId,
    source: "LMS",
    external_id: externalId,
    status,
    description: params.assignmentName,
    suggested_skill_name: params.skill.name,
    mapped_skill_id: params.skill.id,
    metadata,
    repository_name: params.assignmentName,
    repository_url: params.moodleSiteUrl,
    sync_date: now,
    last_updated: now,
  };

  let evidenceRecordId: string | null = existing?.id ? String(existing.id) : null;
  let created = false;
  let updated = false;

  if (existing?.id) {
    const { data: updatedRow, error: updateError } = await admin
      .from("evidence_records")
      .update(corePayload)
      .eq("id", existing.id)
      .select("id")
      .maybeSingle();

    if (updateError) {
      console.error("[moodle-repair] evidence_records update failed:", updateError.message, corePayload);
      logMoodleRepair(params.assignmentName, params.skill.name, null);
      return { evidenceRecordId: null, created: false, updated: false };
    }

    evidenceRecordId = updatedRow?.id ? String(updatedRow.id) : evidenceRecordId;
    updated = Boolean(evidenceRecordId);
  } else {
    const { data: insertedRow, error: insertError } = await admin
      .from("evidence_records")
      .insert(corePayload)
      .select("id")
      .maybeSingle();

    if (insertError) {
      console.error("[moodle-repair] evidence_records insert failed:", insertError.message, corePayload);
      logMoodleRepair(params.assignmentName, params.skill.name, null);
      return { evidenceRecordId: null, created: false, updated: false };
    }

    evidenceRecordId = insertedRow?.id ? String(insertedRow.id) : null;
    created = Boolean(evidenceRecordId);
  }

  if (evidenceRecordId) {
    const { error: linkError } = await admin
      .from("skill_evidence_links")
      .upsert(
        {
          user_id: params.userId,
          skill_id: params.skill.id,
          evidence_record_id: evidenceRecordId,
          linked_at: now,
        },
        { onConflict: "skill_id,evidence_record_id" },
      );

    if (linkError) {
      console.warn("[moodle-repair] skill_evidence_links upsert failed:", linkError.message);
    }
  }

  logMoodleRepair(params.assignmentName, params.skill.name, evidenceRecordId);
  return { evidenceRecordId, created, updated };
}

export async function repairMoodleEvidenceRecords(
  admin: SupabaseClient,
  userId: string,
): Promise<MoodleEvidenceRepairResult> {
  console.log("[moodle-repair] starting repair for user:", userId);

  const logs: string[] = [];
  let evidenceCreated = 0;
  let evidenceUpdated = 0;
  let skillLinksCreated = 0;
  let unmatchedAssignments = 0;

  const [{ data: skillsRows }, { data: courseRows }, { data: assignmentRows }, { data: feedbackRows }] =
    await Promise.all([
      admin.from("declared_skills").select("id, name").eq("user_id", userId),
      admin.from("moodle_courses").select("moodle_course_id, fullname, shortname, moodle_site_url").eq("user_id", userId),
      admin.from("moodle_assignments").select(
        "moodle_course_id, moodle_assignment_id, name, grade, grade_max, competency_tags, feedback, moodle_site_url, synced_at, submission_text, raw",
      ).eq("user_id", userId),
      admin.from("moodle_feedback").select("moodle_assignment_id, feedback_text").eq("user_id", userId),
    ]);

  const skills = (skillsRows ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name ?? ""),
  }));

  const coursesById = new Map<number, { fullname: string; shortname: string | null; moodle_site_url: string | null }>();
  for (const row of courseRows ?? []) {
    coursesById.set(Number(row.moodle_course_id), {
      fullname: String(row.fullname ?? ""),
      shortname: row.shortname ? String(row.shortname) : null,
      moodle_site_url: row.moodle_site_url ? String(row.moodle_site_url) : null,
    });
  }

  const feedbackByAssignment = new Map<number, string>();
  for (const row of feedbackRows ?? []) {
    const assignmentId = Number(row.moodle_assignment_id);
    const text = asText(row.feedback_text);
    if (assignmentId && text) feedbackByAssignment.set(assignmentId, text);
  }

  const assignments = assignmentRows ?? [];
  console.log("[moodle-repair] assignments found:", assignments.length);
  logs.push(`Moodle assignments found: ${assignments.length}`);

  for (const row of assignments) {
    const assignmentId = Number(row.moodle_assignment_id);
    const courseId = Number(row.moodle_course_id);
    const course = coursesById.get(courseId);
    const courseName = course?.fullname ?? `Course ${courseId}`;
    const courseShortname = course?.shortname ?? null;
    const moodleSiteUrl = asText(row.moodle_site_url) || asText(course?.moodle_site_url) || LIVE_MOODLE_SITE_URL;
    const assignmentName = asText(row.name) || `Assignment ${assignmentId}`;
    const teacherFeedback = asText(row.feedback) || feedbackByAssignment.get(assignmentId) || null;
    const grade = asNumber(row.grade);
    const gradeMax = asNumber(row.grade_max);
    const assignmentIntro = extractMoodleAssignmentIntroText(row.raw);
    const submissionText = moodleHtmlToPlainText(row.submission_text);

    const matched = resolveCompetencyForMoodleAssignment(skills, {
      courseName,
      courseShortname,
      assignmentName,
      competencyTags: row.competency_tags,
      assignmentIntro,
      submissionText,
    });

    if (!matched) {
      unmatchedAssignments += 1;
      logMoodleRepair(assignmentName, null, null);
      logs.push(`No competency match for assignment "${assignmentName}" (${assignmentId})`);
      continue;
    }

    if (
      matched.submissionLanguageConflict
      || (matched.introOnlyRelevance && !matched.basis.includes("submission"))
    ) {
      unmatchedAssignments += 1;
      logs.push(
        `Assignment "${assignmentName}" relevance to "${matched.skill.name}" not eligible for evidence upsert [${matched.basis.join(",")}]`,
      );
      continue;
    }

    const result = await upsertMoodleAssignmentEvidenceRecord(admin, {
      userId,
      skill: matched.skill,
      moodleSiteUrl,
      moodleCourseId: courseId,
      moodleAssignmentId: assignmentId,
      courseName,
      assignmentName,
      grade,
      gradeMax,
      teacherFeedback,
      syncedAt: asText(row.synced_at) || new Date().toISOString(),
      requireGrade: false,
      matchBasis: matched.basis,
      introOnlyRelevance: matched.introOnlyRelevance,
      submissionText,
      submissionLanguageConflict: matched.submissionLanguageConflict,
      matchScore: matched.score,
    });

    if (result.created) evidenceCreated += 1;
    if (result.updated) evidenceUpdated += 1;
    if (result.evidenceRecordId) skillLinksCreated += 1;

    logs.push(
      `Assignment "${assignmentName}" → competency "${matched.skill.name}" [${matched.basis.join(",")}] · evidence ${result.evidenceRecordId ?? "—"}`,
    );
  }

  console.log("[moodle-repair] complete", {
    assignmentsFound: assignments.length,
    evidenceCreated,
    evidenceUpdated,
    unmatchedAssignments,
  });

  return {
    assignmentsFound: assignments.length,
    evidenceCreated,
    evidenceUpdated,
    skillLinksCreated,
    unmatchedAssignments,
    logs,
  };
}
