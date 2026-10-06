export type CompetencyMatch = {
  id: string;
  label: string;
  skills: string[];
  preferVerified: boolean;
};

const FRONTEND = ["frontend development", "javascript", "typescript", "react", "html", "css", "next.js", "vue", "ui"];
const BACKEND = ["node", "java", "api", "rest", "express", "python"];
const DATABASE = ["sql", "postgres", "mongodb", "supabase"];
const MOBILE = ["dart", "flutter", "android", "kotlin", "swift", "mobile app development"];

const TAXONOMY: { id: string; label: string; skills: string[] }[] = [
  { id: "frontend", label: "frontend", skills: FRONTEND },
  { id: "backend", label: "backend", skills: BACKEND },
  { id: "database", label: "database", skills: DATABASE },
  { id: "mobile", label: "mobile", skills: MOBILE },
  { id: "full-stack", label: "full-stack", skills: [...FRONTEND, ...BACKEND, ...DATABASE] },
];

export function normalizeSkill(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9+#]+/g, " ").replace(/\s+/g, " ").trim();
}

export function skillsMatch(left: string, right: string): boolean {
  const have = normalizeSkill(left);
  const want = normalizeSkill(right);
  if (!have || !want) return false;
  if ((want === "java" || want.startsWith("java ")) && have.includes("javascript")) return false;
  if ((have === "java" || have.startsWith("java ")) && want.includes("javascript")) return false;
  if (have === want) return true;
  if (want.length < 3 || have.length < 3) return false;
  return have.includes(want) || want.includes(have);
}

export function competencyFromQuestion(question: string): CompetencyMatch {
  const text = normalizeSkill(question);
  const preferVerified = text.includes("verified");
  const mentioned = TAXONOMY.filter((entry) => {
    if (entry.id === "full-stack") return text.includes("full stack") || text.includes("fullstack");
    return skillsMatch(text, entry.label) || entry.skills.some((skill) => skillsMatch(text, skill));
  });
  const specific = mentioned.find((entry) => entry.id !== "full-stack") ?? mentioned[0];
  if (specific) return { ...specific, preferVerified };
  return { id: "shared", label: "shared evidence", skills: [], preferVerified };
}

export function matchedSkillNames(skillNames: string[], competency: CompetencyMatch): string[] {
  if (!competency.skills.length) return [];
  const matched: string[] = [];
  for (const name of skillNames) {
    if (!competency.skills.some((skill) => skillsMatch(name, skill))) continue;
    if (matched.some((existing) => skillsMatch(existing, name))) continue;
    matched.push(name);
  }
  return matched;
}

const DISPLAY_NAMES: Record<string, string> = {
  typescript: "TypeScript",
  javascript: "JavaScript",
  java: "Java",
  react: "React",
  html: "HTML",
  css: "CSS",
  dart: "Dart",
  node: "Node.js",
  "node.js": "Node.js",
  sql: "SQL",
  "frontend development": "Frontend Development",
  "mobile app development": "Mobile App Development",
  postgres: "PostgreSQL",
  postgresql: "PostgreSQL",
  mongodb: "MongoDB",
  supabase: "Supabase",
  python: "Python",
  flutter: "Flutter",
  vue: "Vue",
  "next.js": "Next.js",
  express: "Express",
  api: "API",
  rest: "REST",
  android: "Android",
  kotlin: "Kotlin",
  swift: "Swift",
  ui: "UI",
};

export function displaySkill(value: string): string {
  const key = normalizeSkill(value);
  if (!key) return "";
  if (DISPLAY_NAMES[key]) return DISPLAY_NAMES[key];
  return key.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function covers(declared: string[], skill: string): boolean {
  const want = normalizeSkill(skill);
  return declared.some((name) => normalizeSkill(name) === want || skillsMatch(name, skill));
}

const COMPETENCY_LABELS = new Set(["frontend", "backend", "database", "mobile", "full stack", "fullstack", "full-stack"]);

export type CountMetric = "skills" | "credentials" | "evidence" | "verifiedEvidence";
export type CountOperator = ">=" | ">" | "<=" | "<" | "=";

export type CountFilter = {
  metric: CountMetric;
  operator: CountOperator;
  value: number;
};

export type MatchQuery = {
  intent: "filter" | "rank" | "compare" | "gap" | "summary" | "filter_count";
  requiredSkills: string[];
  competencies: string[];
  verifiedOnly: boolean;
  count: CountFilter | null;
};

function parseCountFilter(text: string): CountFilter | null {
  let metric: CountMetric | null = null;
  if (/verified evidence/.test(text)) metric = "verifiedEvidence";
  else if (/\bevidence\b/.test(text)) metric = "evidence";
  else if (/\bcredentials?\b/.test(text)) metric = "credentials";
  else if (/\bskills?\b/.test(text)) metric = "skills";
  if (!metric) return null;

  const atLeast = text.match(/at least (\d+)/);
  const orMore = text.match(/(\d+)\s+or more/);
  const plus = text.match(/(\d+)\s*\+/);
  const moreThan = text.match(/more than (\d+)/);
  const fewer = text.match(/(?:fewer|less) than (\d+)/);
  const orFewer = text.match(/(\d+)\s+or fewer/);
  const exactly = text.match(/exactly (\d+)/);
  const bare = text.match(/(?:have|has|with)\s+(\d+)\s+(?:skills?|evidence|credentials?|verified)/);
  if (atLeast) return { metric, operator: ">=", value: Number(atLeast[1]) };
  if (orMore) return { metric, operator: ">=", value: Number(orMore[1]) };
  if (plus) return { metric, operator: ">=", value: Number(plus[1]) };
  if (moreThan) return { metric, operator: ">", value: Number(moreThan[1]) };
  if (fewer) return { metric, operator: "<", value: Number(fewer[1]) };
  if (orFewer) return { metric, operator: "<=", value: Number(orFewer[1]) };
  if (exactly) return { metric, operator: "=", value: Number(exactly[1]) };
  if (bare) return { metric, operator: ">=", value: Number(bare[1]) };
  return null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function taxonomySkills(id: string): string[] {
  return TAXONOMY.find((entry) => entry.id === id)?.skills ?? [];
}

/** Explicit skill names in the question win. Taxonomy expands only when none are named. */
export function parseMatchQuery(question: string, knownSkills: string[] = []): MatchQuery {
  const text = normalizeSkill(question);
  const count = parseCountFilter(text);
  if (count) {
    return {
      intent: "filter_count",
      requiredSkills: [],
      competencies: [],
      verifiedOnly: count.metric === "verifiedEvidence",
      count,
    };
  }
  const verifiedOnly = /\bverified\b/.test(text);
  const rankAsked = /\b(rank|best|strongest|better|stronger)\b/.test(text);
  const compareAsked = /\b(compare|versus)\b/.test(text) || /\bvs\b/.test(text);
  const gapAsked = /\b(gap|missing|without)\b/.test(text);
  const filterAsked = /\b(show|with|who has|have|having)\b/.test(text);
  const pool = [...knownSkills, ...TAXONOMY.flatMap((entry) => entry.skills)];
  const phrases = [...new Set(pool.map((skill) => normalizeSkill(skill)).filter((skill) => skill.length >= 3 && !COMPETENCY_LABELS.has(skill)))]
    .sort((left, right) => right.length - left.length);
  const required: { name: string; at: number }[] = [];
  for (const phrase of phrases) {
    const at = text.search(new RegExp(`(^|\\s)${escapeRegExp(phrase)}(\\s|$)`));
    if (at < 0) continue;
    if (required.some((existing) => skillsMatch(existing.name, phrase))) continue;
    required.push({ name: displaySkill(phrase), at });
  }
  required.sort((left, right) => left.at - right.at);
  const competencies = TAXONOMY
    .filter((entry) => {
      if (entry.id === "full-stack") return text.includes("full stack") || text.includes("fullstack");
      return new RegExp(`(^|\\s)${entry.id}(\\s|$)`).test(text) || skillsMatch(text, entry.label);
    })
    .map((entry) => entry.id)
    .filter((id) => id !== "full-stack" || !competenciesHasSpecific(text));
  const namedCompetencies = required.length
    ? competencies.filter((id) => id === "full-stack" || new RegExp(`(^|\\s)${id}(\\s|$)`).test(text))
    : competencies;
  let intent: MatchQuery["intent"] = "summary";
  if (compareAsked) intent = "compare";
  else if (rankAsked) intent = "rank";
  else if (filterAsked && required.length) intent = "filter";
  else if (gapAsked) intent = "gap";
  else if (required.length) intent = "filter";
  else if (namedCompetencies.length) intent = "rank";
  return {
    intent,
    requiredSkills: required.map((skill) => skill.name),
    competencies: intent === "filter" && required.length ? [] : namedCompetencies,
    verifiedOnly,
    count: null,
  };
}

function competenciesHasSpecific(text: string): boolean {
  return TAXONOMY.some((entry) => entry.id !== "full-stack" && (new RegExp(`(^|\\s)${entry.id}(\\s|$)`).test(text)));
}

export function missingSkillNames(skillNames: string[], competency: CompetencyMatch): string[] {
  if (!competency.skills.length) return [];
  const groups = competency.id === "full-stack" ? [FRONTEND, BACKEND, DATABASE] : [competency.skills];
  const queues = groups.map((skills) => skills.filter((skill) => !covers(skillNames, skill)));
  const missing: string[] = [];
  while (missing.length < 4 && queues.some((queue) => queue.length > 0)) {
    for (const queue of queues) {
      const next = queue.shift();
      if (!next || covers(skillNames, next)) continue;
      missing.push(displaySkill(next));
      if (missing.length === 4) break;
    }
  }
  return missing;
}
