/**
 * Shared competency name normalization and programming-language matching (backend).
 * Mirrors src/lib/competency-matching.ts — keep in sync when changing rules.
 */

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

export function isProgrammingLanguageSkill(competencyName: string): boolean {
  return PROGRAMMING_LANGUAGE_SKILLS.has(normalizedCompetencyText(competencyName));
}

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
  plpgsql: "sql",
  postgresql: "sql",
  postgres: "sql",
  mysql: "sql",
};

export function githubLanguageToCanonical(language: string): string {
  const n = normalizedCompetencyText(language);
  return GITHUB_LANGUAGE_CANONICAL[n] ?? canonicalProgrammingLanguageKey(n);
}

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