/**
 * Phase 1 Option B: declared-competency matching against Moodle text fields.
 * Deterministic only — no AI calls. Treat all Moodle text as untrusted.
 */

export const MOODLE_CONTENT_MATCH_MAX_CHARS = 8_000;

export type MoodleMatchBasis =
  | "title"
  | "course"
  | "tags"
  | "intro"
  | "submission";

export type DeclaredSkillRef = { id: string; name: string };

export type MoodleAssignmentMatchParams = {
  courseName?: string | null;
  courseShortname?: string | null;
  assignmentName?: string | null;
  competencyTags?: unknown;
  /** Plain-text assignment intro/description (HTML already stripped). */
  assignmentIntro?: string | null;
  /** Learner online-text submission (not file contents). */
  submissionText?: string | null;
};

export type MoodleCompetencyMatch = {
  skill: DeclaredSkillRef;
  basis: MoodleMatchBasis[];
  /** True when relevance came only from intro (instructions), not title/course/tags/submission. */
  introOnlyRelevance: boolean;
  /** Weighted score used for deterministic multi-skill selection. */
  score: number;
  /** True when learner submission text clearly indicates a different programming language. */
  submissionLanguageConflict: boolean;
};

/** Basis weights: submission evidence outranks instructions/course context. */
const BASIS_WEIGHT: Record<MoodleMatchBasis, number> = {
  submission: 100,
  title: 40,
  tags: 40,
  intro: 20,
  course: 10,
};

const PROGRAMMING_LANGUAGE_SKILLS = new Set([
  "java",
  "javascript",
  "js",
  "typescript",
  "ts",
  "python",
  "py",
  "c++",
  "cpp",
  "c#",
  "csharp",
  "c",
  "go",
  "golang",
  "rust",
  "kotlin",
  "swift",
  "ruby",
  "php",
  "r",
]);

export function normalizedCompetencyText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim()
    .toLowerCase();
}

/** Strip Moodle HTML and decode common entities; truncate for matching/cost bounds. */
export function moodleHtmlToPlainText(raw: unknown, maxChars = MOODLE_CONTENT_MATCH_MAX_CHARS): string {
  if (raw == null) return "";
  const asString = typeof raw === "string" ? raw : String(raw);
  const stripped = asString
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
    .trim();
  return stripped.slice(0, maxChars);
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

/**
 * Pull intro/description from Moodle assign raw without schema changes.
 * Supports: intro_text, raw.intro, raw.assign.intro, raw.modAssign.intro, nested merge shapes.
 */
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
    // Nested modAssign under an already-selected bucket.
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

/**
 * Detect programming languages mentioned/used in text.
 * Used to block intro→verify when submission clearly uses another language.
 */
export function detectProgrammingLanguagesInText(haystack: unknown): string[] {
  const text = normalizedCompetencyText(haystack);
  if (!text) return [];
  const found: string[] = [];
  const checks: Array<[string, () => boolean]> = [
    ["java", () => matchesCompetencyToken(text, "Java")],
    ["javascript", () => matchesCompetencyToken(text, "JavaScript")],
    ["typescript", () => matchesCompetencyToken(text, "TypeScript")],
    ["python", () => matchesCompetencyToken(text, "Python")],
    ["c++", () => matchesCompetencyToken(text, "C++")],
    ["c#", () => matchesCompetencyToken(text, "C#")],
    ["go", () => matchesCompetencyToken(text, "Go")],
    ["rust", () => /(?:^|[^a-z0-9_])rust(?=[^a-z0-9_]|$)/i.test(text)],
    ["kotlin", () => /(?:^|[^a-z0-9_])kotlin(?=[^a-z0-9_]|$)/i.test(text)],
    ["php", () => /(?:^|[^a-z0-9_])php(?=[^a-z0-9_]|$)/i.test(text)],
    ["ruby", () => /(?:^|[^a-z0-9_])ruby(?=[^a-z0-9_]|$)/i.test(text)],
    ["swift", () => /(?:^|[^a-z0-9_])swift(?=[^a-z0-9_]|$)/i.test(text)],
    ["c", () => matchesCompetencyToken(text, "C")],
    ["r", () => matchesCompetencyToken(text, "R")],
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

/** Language-aware token match to avoid Java ⊂ JavaScript false positives. */
export function matchesCompetencyToken(haystack: unknown, competencyName: string): boolean {
  const text = normalizedCompetencyText(haystack);
  const skill = normalizedCompetencyText(competencyName);
  if (!text || !skill) return false;

  const token = (pattern: string) => new RegExp(`(?:^|[^a-z0-9_])(?:${pattern})(?=[^a-z0-9_]|$)`, "i");

  if (skill === "java") {
    return token("java(?!script)").test(text);
  }
  if (skill === "javascript" || skill === "js") {
    return token("javascript").test(text)
      || token("node\\.?js").test(text)
      || token("js").test(text);
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
  if (skill === "c") {
    return token("c(?!\\+\\+|#|ss|at)").test(text);
  }
  if (skill === "python" || skill === "py") {
    return token("python").test(text) || token("py").test(text);
  }
  if (skill === "go" || skill === "golang") {
    return token("golang").test(text) || token("go(?:lang)?").test(text);
  }
  if (skill === "r") {
    return token("r").test(text);
  }

  return text === skill || text.includes(skill) || skill.includes(text);
}

export function matchesCompetencyTags(tags: unknown, competencyName: string): boolean {
  if (!Array.isArray(tags)) return false;
  return tags.some((tag) => {
    if (typeof tag === "string") return matchesCompetencyToken(tag, competencyName);
    if (tag && typeof tag === "object") {
      const row = tag as Record<string, unknown>;
      return matchesCompetencyToken(row.name, competencyName)
        || matchesCompetencyToken(row.shortname, competencyName)
        || matchesCompetencyToken(row.label, competencyName);
    }
    return false;
  });
}

function collectBasis(
  skillName: string,
  params: MoodleAssignmentMatchParams,
): MoodleMatchBasis[] {
  const basis: MoodleMatchBasis[] = [];
  if (matchesCompetencyToken(params.assignmentName, skillName)) basis.push("title");
  if (
    matchesCompetencyToken(params.courseName, skillName)
    || matchesCompetencyToken(params.courseShortname, skillName)
  ) {
    basis.push("course");
  }
  if (matchesCompetencyTags(params.competencyTags, skillName)) basis.push("tags");
  if (matchesCompetencyToken(params.assignmentIntro, skillName)) basis.push("intro");
  if (matchesCompetencyToken(params.submissionText, skillName)) basis.push("submission");
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
  if (matchesCompetencyToken(submission, skillName)) return false;

  const detected = detectProgrammingLanguagesInText(submission);
  if (detected.length === 0) return false;

  const skillKey = canonicalLanguageKey(skillName);
  return detected.some((lang) => lang !== skillKey);
}

/** Stable ordering so matching does not depend on unordered DB row order. */
export function sortDeclaredSkillsDeterministically(
  skills: DeclaredSkillRef[],
): DeclaredSkillRef[] {
  return [...skills].sort((a, b) => {
    const nameCmp = normalizedCompetencyText(a.name).localeCompare(normalizedCompetencyText(b.name));
    if (nameCmp !== 0) return nameCmp;
    return String(a.id).localeCompare(String(b.id));
  });
}

/**
 * Resolve the best declared skill for an assignment.
 * Prefers learner submission evidence over intro/course context.
 * Phase 1 links at most one skill (pipeline limitation documented).
 */
export function resolveCompetencyForMoodleAssignment(
  skills: DeclaredSkillRef[],
  params: MoodleAssignmentMatchParams,
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
      // Deterministic tie-break: prefer submission-backed, then name/id order (already sorted).
      const bestHasSubmission = best.basis.includes("submission");
      const candidateHasSubmission = candidate.basis.includes("submission");
      if (candidateHasSubmission && !bestHasSubmission) {
        best = candidate;
      }
    }
  }

  return best;
}

/** True when Moodle provides learner performance signal (grade and/or submission text). */
export function hasMoodlePerformanceEvidence(params: {
  grade?: number | null;
  submissionText?: string | null;
}): boolean {
  if (params.grade != null && Number.isFinite(params.grade)) return true;
  return Boolean(params.submissionText && params.submissionText.trim().length >= 12);
}

/**
 * Whether matched relevance may become verified LMS evidence.
 *
 * Rules:
 * - requireGrade (default): numeric grade required
 * - intro-only / instruction-context matches are relevance, not proof of a language skill
 * - conflicting submission language blocks automatic verification
 * - programming-language skills need submission match, or strong title/tags match without conflict
 * - missing/inconclusive submission does not demonstrate a programming language
 */
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

  // Assignment instructions / course context alone must not prove a programming language.
  if (skillIsLanguage && instructionalOnly) {
    return false;
  }

  if (skillIsLanguage && !hasSubmissionBasis && submissionInconclusive && !hasStrongNonIntroBasis) {
    return false;
  }

  // Intro-only relevance without learner content match: never auto-verify.
  if (params.match.introOnlyRelevance && !hasSubmissionBasis) {
    return false;
  }

  return true;
}
