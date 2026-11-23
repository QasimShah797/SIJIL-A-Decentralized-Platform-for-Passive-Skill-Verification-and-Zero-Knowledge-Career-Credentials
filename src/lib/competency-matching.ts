/**
 * Shared competency name normalization and programming-language matching.
 * Used for declared-skill dedup, GitHub language breakdown, and recruiter views.
 */
import {
  isProgrammingLanguageSkill,
  matchesCompetencyToken,
  normalizedCompetencyText,
} from "@/lib/moodle-competency-content-matching";

export { normalizedCompetencyText, matchesCompetencyToken, isProgrammingLanguageSkill };

/** Stable key for case-insensitive competency name comparison (dedup, recruiter filters). */
export function declaredCompetencyKey(name: unknown): string {
  return normalizedCompetencyText(name).replace(/\s+/g, " ");
}

export function declaredCompetencyNamesEqual(a: unknown, b: unknown): boolean {
  const left = declaredCompetencyKey(a);
  const right = declaredCompetencyKey(b);
  return left.length > 0 && left === right;
}

function canonicalProgrammingLanguageKey(identifier: string): string {
  const n = normalizedCompetencyText(identifier);
  if (n === "js" || n === "javascript") return "javascript";
  if (n === "ts" || n === "typescript") return "typescript";
  if (n === "py" || n === "python") return "python";
  if (n === "cpp" || n === "c++") return "c++";
  if (n === "csharp" || n === "c#") return "c#";
  if (n === "golang" || n === "go") return "go";
  if (n === "kotlin") return "kotlin";
  return n;
}

/** GitHub linguist labels and common dependency tokens → canonical language key. */
const GITHUB_LANGUAGE_CANONICAL: Record<string, string> = {
  java: "java",
  javascript: "javascript",
  typescript: "typescript",
  python: "python",
  "c++": "c++",
  cpp: "c++",
  c: "c",
  "c#": "c#",
  csharp: "c#",
  go: "go",
  golang: "go",
  rust: "rust",
  kotlin: "kotlin",
  swift: "swift",
  ruby: "ruby",
  php: "php",
  r: "r",
  html: "html",
  css: "css",
  scss: "css",
  sass: "css",
  less: "css",
  sql: "sql",
  plsql: "sql",
  postgresql: "sql",
  postgres: "sql",
  mysql: "sql",
};

export function githubLanguageToCanonical(language: string): string {
  const n = normalizedCompetencyText(language);
  return GITHUB_LANGUAGE_CANONICAL[n] ?? canonicalProgrammingLanguageKey(n);
}

/** Controlled aliases — exact canonical keys only (no substring). */
const SKILL_LANGUAGE_ALIASES: Record<string, string[]> = {
  postgresql: ["sql", "postgres", "plpgsql"],
  postgres: ["sql", "postgresql", "plpgsql"],
  sql: ["postgresql", "postgres", "plpgsql", "mysql"],
  mysql: ["sql"],
  react: ["javascript", "typescript", "jsx", "tsx"],
  "react.js": ["javascript", "typescript", "react", "jsx"],
  reactjs: ["javascript", "typescript", "react"],
  node: ["javascript", "typescript"],
  "node.js": ["javascript", "typescript"],
  express: ["javascript", "typescript", "node"],
  vue: ["javascript", "typescript"],
  angular: ["javascript", "typescript"],
  typescript: ["javascript"],
  javascript: ["typescript"],
  java: ["kotlin"],
  python: ["django", "flask"],
  css: ["scss", "sass", "less"],
  html: ["css"],
};

function skillCanonicalLanguageKey(skillName: string): string | null {
  const key = canonicalProgrammingLanguageKey(skillName);
  if (isProgrammingLanguageSkill(skillName)) return key;
  return null;
}

/**
 * Whether a declared skill relates to a GitHub repository language label or breakdown key.
 * Never uses substring matching for programming languages (Java ≠ JavaScript).
 */
export function skillRelatesToRepositoryLanguage(skillName: string, language: string): boolean {
  const skillNorm = normalizedCompetencyText(skillName);
  const langCanon = githubLanguageToCanonical(language);
  if (!skillNorm || !langCanon) return false;

  const skillLang = skillCanonicalLanguageKey(skillName);
  if (skillLang) {
    if (skillLang === langCanon) return true;
    const aliases = SKILL_LANGUAGE_ALIASES[skillNorm] ?? [];
    return aliases.some((alias) => githubLanguageToCanonical(alias) === langCanon);
  }

  if (skillNorm === langCanon) return true;

  const aliases = SKILL_LANGUAGE_ALIASES[skillNorm] ?? [];
  return aliases.some((alias) => githubLanguageToCanonical(alias) === langCanon);
}

/** Repo name / description / topics: use token rules for language skills to avoid Java ⊂ JavaScript. */
export function skillReferencedInText(skillName: string, text: unknown): boolean {
  const hay = normalizedCompetencyText(text);
  if (!hay) return false;
  if (isProgrammingLanguageSkill(skillName)) {
    return matchesCompetencyToken(hay, skillName);
  }
  const skillNorm = normalizedCompetencyText(skillName);
  if (!skillNorm) return false;
  return hay === skillNorm || hay.includes(skillNorm);
}