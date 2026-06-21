/**
 * Project evidence ↔ declared skill matching.
 * Repositories are project evidence — one repo may support multiple skill claims.
 */
export type MatchConfidence = "high" | "medium" | "low";

export type LanguageBreakdown = Record<string, number>;

export interface ProjectEvidenceInput {
  repositoryName: string;
  repoFullName?: string | null;
  description: string | null;
  primaryLanguage: string | null;
  languageBreakdown: LanguageBreakdown;
  topics: string[];
  dependencies: string[];
  metadata?: Record<string, unknown> | null;
}

export interface SkillMatchInput {
  id: string;
  name: string;
  domain: string;
}

export interface SkillMatchResult {
  confidence: MatchConfidence;
  reasons: string[];
  signals: Record<string, unknown>;
}

const SKILL_LANGUAGE_ALIASES: Record<string, string[]> = {
  postgresql: ["sql", "postgres", "plpgsql"],
  postgres: ["sql", "postgresql", "plpgsql"],
  sql: ["postgresql", "postgres", "plpgsql", "mysql"],
  mysql: ["sql"],
  react: ["javascript", "typescript", "jsx", "tsx"],
  "react.js": ["javascript", "typescript", "react", "jsx"],
  "reactjs": ["javascript", "typescript", "react"],
  node: ["javascript", "typescript"],
  "node.js": ["javascript", "typescript"],
  express: ["javascript", "typescript", "node"],
  vue: ["javascript", "typescript"],
  angular: ["javascript", "typescript"],
  typescript: ["javascript"],
  javascript: ["typescript"],
  java: ["kotlin", "gradle"],
  python: ["django", "flask"],
  css: ["scss", "sass", "less"],
  html: ["css"],
};

function normalizeTokens(name: string): string[] {
  return name.toLowerCase().split(/[\s.+&/_-]+/).filter((t) => t.length >= 2);
}

function topicsFromEvidence(evidence: ProjectEvidenceInput): string[] {
  if (evidence.topics.length) return evidence.topics;
  const raw = evidence.metadata?.topics;
  return Array.isArray(raw) ? (raw as string[]) : [];
}

function dependenciesFromEvidence(evidence: ProjectEvidenceInput): string[] {
  if (evidence.dependencies.length) return evidence.dependencies;
  const raw = evidence.metadata?.dependencies;
  return Array.isArray(raw) ? (raw as string[]) : [];
}

function languageBreakdownFromEvidence(evidence: ProjectEvidenceInput): LanguageBreakdown {
  if (Object.keys(evidence.languageBreakdown).length) return evidence.languageBreakdown;
  const raw = evidence.metadata?.language_breakdown;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as LanguageBreakdown;
  }
  return {};
}

function skillRelatesToLanguage(skillName: string, language: string): boolean {
  const skillLower = skillName.trim().toLowerCase();
  const langLower = language.trim().toLowerCase();
  if (!skillLower || !langLower) return false;
  if (skillLower === langLower) return true;
  if (skillLower.includes(langLower) || langLower.includes(skillLower)) return true;

  const skillTokens = normalizeTokens(skillName);
  if (skillTokens.some((t) => t === langLower || langLower.includes(t))) return true;

  for (const token of skillTokens) {
    const aliases = SKILL_LANGUAGE_ALIASES[token] ?? [];
    if (aliases.some((a) => a === langLower || langLower.includes(a))) return true;
    if (SKILL_LANGUAGE_ALIASES[langLower]?.includes(token)) return true;
  }

  const skillAliases = SKILL_LANGUAGE_ALIASES[skillLower] ?? [];
  return skillAliases.some((a) => a === langLower || langLower.includes(a));
}

function skillRelatesToDependency(skillName: string, dependency: string): boolean {
  const depLower = dependency.toLowerCase();
  const skillLower = skillName.toLowerCase();
  const tokens = normalizeTokens(skillName);
  if (depLower.includes(skillLower.replace(/\s+/g, ""))) return true;
  return tokens.some((t) => t.length >= 3 && depLower.includes(t));
}

export function buildProjectHaystack(evidence: ProjectEvidenceInput): string {
  const topics = topicsFromEvidence(evidence);
  const deps = dependenciesFromEvidence(evidence);
  const breakdown = languageBreakdownFromEvidence(evidence);
  return [
    evidence.repositoryName,
    evidence.repoFullName ?? "",
    evidence.description ?? "",
    topics.join(" "),
    deps.join(" "),
    Object.keys(breakdown).join(" "),
  ].join(" ").toLowerCase();
}

export function evaluateSkillProjectMatch(
  skill: SkillMatchInput,
  evidence: ProjectEvidenceInput,
): SkillMatchResult {
  const reasons: string[] = [];
  const signals: Record<string, unknown> = {};
  const breakdown = languageBreakdownFromEvidence(evidence);
  const topics = topicsFromEvidence(evidence);
  const dependencies = dependenciesFromEvidence(evidence);
  const haystack = buildProjectHaystack(evidence);
  const nameTokens = normalizeTokens(skill.name);
  const skillNameLower = skill.name.trim().toLowerCase();
  const domainNorm = skill.domain.trim().toLowerCase();
  const repoNameLower = evidence.repositoryName.toLowerCase();

  const matchedLangEntries = Object.entries(breakdown)
    .filter(([lang, pct]) => pct > 0 && skillRelatesToLanguage(skill.name, lang))
    .sort((a, b) => b[1] - a[1]);

  if (matchedLangEntries.length) {
    const [lang, pct] = matchedLangEntries[0];
    reasons.push(`Matched because this repository contains ${Math.round(pct)}% ${lang} code.`);
    signals.languageMatch = { language: lang, percentage: pct };
  }

  const matchedDeps = dependencies.filter((dep) => skillRelatesToDependency(skill.name, dep));
  if (matchedDeps.length) {
    reasons.push(`Matched because package.json includes ${matchedDeps.slice(0, 3).join(", ")} dependency.`);
    signals.dependencyMatch = matchedDeps.slice(0, 5);
  }

  const matchedTopics = topics.filter((topic) => {
    const tl = topic.toLowerCase();
    return nameTokens.some((t) => tl.includes(t)) || tl.includes(skillNameLower);
  });
  if (matchedTopics.length) {
    reasons.push(`Matched because repository topics include ${matchedTopics.slice(0, 3).join(", ")}.`);
    signals.topicMatch = matchedTopics.slice(0, 5);
  }

  const nameInRepo =
    nameTokens.some((t) => t.length >= 3 && repoNameLower.includes(t))
    || repoNameLower.includes(skillNameLower.replace(/\s+/g, "-"));

  const descriptionMatch = nameTokens.some((t) =>
    (evidence.description ?? "").toLowerCase().includes(t),
  );

  if (nameInRepo && !reasons.length) {
    reasons.push(`Matched because repository name references ${skill.name}.`);
    signals.nameMatch = true;
  } else if (descriptionMatch && !reasons.some((r) => r.includes("topics"))) {
    reasons.push(`Matched because repository description references ${skill.name}.`);
    signals.descriptionMatch = true;
  }

  const domainInHaystack = domainNorm !== "general" && domainNorm.length > 1 && haystack.includes(domainNorm);
  if (domainInHaystack && !reasons.length) {
    reasons.push(`Matched because repository metadata aligns with ${skill.domain} domain.`);
    signals.domainMatch = true;
  }

  const sqlFileHint = Boolean(
    evidence.metadata?.has_sql_files
    || (evidence.description ?? "").toLowerCase().includes("migration"),
  );
  if (
    sqlFileHint
    && (skillNameLower.includes("sql") || skillNameLower.includes("postgres") || domainNorm.includes("database"))
    && !reasons.some((r) => r.toLowerCase().includes("sql"))
  ) {
    reasons.push("Matched because repository contains SQL or migration-related files.");
    signals.sqlFileMatch = true;
  }

  const topLangPct = matchedLangEntries[0]?.[1] ?? 0;
  const hasStrongLanguage = topLangPct >= 8;
  const hasModerateLanguage = topLangPct >= 3;
  const hasDependency = matchedDeps.length > 0;
  const hasTopic = matchedTopics.length > 0;

  let confidence: MatchConfidence = "low";
  if (hasStrongLanguage || hasDependency || (hasTopic && hasModerateLanguage)) {
    confidence = "high";
  } else if (hasModerateLanguage || hasTopic || nameInRepo || descriptionMatch || domainInHaystack) {
    confidence = "medium";
  }

  if (confidence === "low" && reasons.length === 0) {
    return { confidence, reasons, signals };
  }

  return { confidence, reasons, signals };
}

/** @deprecated Use evaluateSkillProjectMatch */
export function scoreSkillEvidenceMatch(
  skill: SkillMatchInput,
  evidence: {
    repositoryName: string;
    description: string | null;
    language: string | null;
    metadata?: Record<string, unknown> | null;
  },
): MatchConfidence {
  const breakdown = evidence.metadata?.language_breakdown as LanguageBreakdown | undefined;
  const result = evaluateSkillProjectMatch(skill, {
    repositoryName: evidence.repositoryName,
    description: evidence.description,
    primaryLanguage: evidence.language,
    languageBreakdown: breakdown ?? {},
    topics: Array.isArray(evidence.metadata?.topics) ? (evidence.metadata!.topics as string[]) : [],
    dependencies: Array.isArray(evidence.metadata?.dependencies)
      ? (evidence.metadata!.dependencies as string[])
      : [],
    metadata: evidence.metadata ?? null,
  });
  return result.confidence;
}

export function buildMatchReasonForSkill(
  skillName: string,
  breakdown: LanguageBreakdown,
): string | null {
  const entries = Object.entries(breakdown)
    .filter(([, pct]) => pct > 0)
    .sort((a, b) => b[1] - a[1]);

  for (const [lang, pct] of entries) {
    if (skillRelatesToLanguage(skillName, lang)) {
      return `Matched because this repository contains ${Math.round(pct)}% ${lang} code.`;
    }
  }
  return null;
}

export function bytesToPercentages(bytesByLang: Record<string, number>): LanguageBreakdown {
  const total = Object.values(bytesByLang).reduce((sum, n) => sum + n, 0);
  if (total <= 0) return {};
  const result: LanguageBreakdown = {};
  for (const [lang, bytes] of Object.entries(bytesByLang)) {
    result[lang] = Math.round((bytes / total) * 1000) / 10;
  }
  return result;
}
