import type { CandidateView } from "@/lib/db/candidates";
import type { CandidateSkill } from "@/lib/sijil-data";

export type MatchRequirement = {
  raw: string;
  skills: string[];
  requireLms: boolean;
  requireGithub: boolean;
  requireTask: boolean;
  requireReviews: boolean;
  institution: string | null;
  minSkillCount: number | null;
};

export type RankedMatch = {
  candidate: CandidateView;
  score: number;
  reasons: string[];
  matchedSkill: string | null;
};

const ALIASES: Record<string, string[]> = {
  typescript: ["ts", "type script"],
  javascript: ["js", "java script"],
  react: ["react.js", "reactjs"],
  dart: ["flutter"],
  python: ["py"],
  postgresql: ["postgres", "psql"],
};

const BUILTIN_SKILLS = [
  "TypeScript",
  "JavaScript",
  "Java",
  "React",
  "Dart",
  "Python",
  "PostgreSQL",
  "Node.js",
];

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9+#.]/g, " ").replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasWord(text: string, token: string): boolean {
  const key = normalize(token);
  if (!key) return false;
  return new RegExp(`(?:^|\\s)${escapeRegExp(key)}(?:\\s|$)`).test(text);
}

function mentions(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => hasWord(haystack, needle) || (needle.length > 3 && haystack.includes(needle)));
}

function uniqueSkills(values: string[]): string[] {
  const byKey = new Map<string, string>();
  for (const value of values) {
    const key = normalize(value);
    if (!key || byKey.has(key)) continue;
    byKey.set(key, value);
  }
  return [...byKey.values()];
}

export function parseRequirement(raw: string, knownSkills: string[]): MatchRequirement {
  const text = normalize(raw);
  const skills: string[] = [];

  for (const skill of [...BUILTIN_SKILLS, ...knownSkills]) {
    const key = normalize(skill);
    if (key.length < 2) continue;
    const aliases = ALIASES[key] ?? [];
    const matched = hasWord(text, key) || aliases.some((alias) => {
      const aliasKey = normalize(alias);
      return aliasKey.length <= 2 ? hasWord(text, aliasKey) : hasWord(text, aliasKey);
    });
    if (matched) skills.push(skill);
  }

  return {
    raw: raw.trim(),
    skills: uniqueSkills(skills),
    requireLms: mentions(text, ["lms", "moodle", "course", "coursework", "faculty", "teacher"]),
    requireGithub: mentions(text, ["github", "repo", "repository", "commit", "project", "projects"]),
    requireTask: mentions(text, ["task", "practical", "passed", "hands on", "hands-on"]),
    requireReviews: mentions(text, ["review", "peer", "endors"]),
    institution: null,
    minSkillCount: minimumSkillCount(raw),
  };
}

function signalSkills(candidate: CandidateView): CandidateSkill[] {
  return (candidate.skillEvidence ?? []).map((item) => ({
    skill: item.skill,
    domain: "Shared competency",
    evidence: item.githubRecords + item.lmsRecords,
    reviews: item.reviews,
    lmsRecords: item.lmsRecords,
    githubRecords: item.githubRecords,
    practicalTask: item.practicalTask,
    externalCert: "—" as const,
    attestation: "Approved" as const,
    attestationSource: candidate.institution,
    attestationDid: "",
    credentialId: null,
  }));
}

function mergeSkillRows(declared: CandidateSkill[], signals: CandidateSkill[]): CandidateSkill[] {
  const byName = new Map<string, CandidateSkill>();
  for (const row of [...declared, ...signals]) {
    const key = row.skill.toLowerCase();
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, row);
      continue;
    }
    byName.set(key, {
      ...existing,
      githubRecords: Math.max(existing.githubRecords, row.githubRecords),
      lmsRecords: Math.max(existing.lmsRecords, row.lmsRecords),
      reviews: Math.max(existing.reviews, row.reviews),
      practicalTask: existing.practicalTask !== "—" ? existing.practicalTask : row.practicalTask,
    });
  }
  return [...byName.values()];
}

function verifiedSkillNames(candidate: CandidateView): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const name of candidate.verifiedSkills ?? []) {
    const key = normalize(name);
    if (!key || key === "—" || seen.has(key)) continue;
    seen.add(key);
    names.push(name.trim());
  }
  return names;
}

function candidateSkillNames(candidate: CandidateView, skills: CandidateSkill[]): string[] {
  return [...new Set([
    ...skills.map((item) => item.skill),
    ...(candidate.skillEvidence ?? []).map((item) => item.skill),
    ...(candidate.searchableSkills ?? []),
    candidate.topSkill !== "—" ? candidate.topSkill : "",
  ].filter(Boolean))];
}

function namesMatch(want: string, have: string): boolean {
  const needle = normalize(want);
  const hay = normalize(have);
  if (!needle || !hay) return false;
  if (hay === needle) return true;
  if (needle === "java" && hay.includes("javascript")) return false;
  if (hay === "java" && needle.includes("javascript")) return false;
  return hasWord(hay, needle) || hasWord(needle, hay);
}

function skillHits(required: string[], available: string[]): string[] {
  return required.filter((want) => available.some((have) => namesMatch(want, have)));
}

function evidenceForSkills(skills: CandidateSkill[], hits: string[]) {
  const focused = hits.length
    ? skills.filter((item) => hits.some((hit) => namesMatch(hit, item.skill)))
    : skills;
  return {
    lms: focused.reduce((sum, item) => sum + item.lmsRecords, 0),
    github: focused.reduce((sum, item) => sum + item.githubRecords, 0),
    reviews: focused.reduce((sum, item) => sum + item.reviews, 0),
    taskPassed: focused.some((item) => item.practicalTask !== "—"),
  };
}

export function rankCandidatesForRequirement(
  requirement: MatchRequirement,
  candidates: CandidateView[],
  skillsById: Record<string, CandidateSkill[]>,
): RankedMatch[] {
  const ranked: RankedMatch[] = [];

  for (const candidate of candidates) {
    if ((candidate.credentialCount ?? 0) <= 0 && !(candidate.searchableSkills?.length)) continue;

    const skills = mergeSkillRows(skillsById[candidate.id] ?? [], signalSkills(candidate));
    const names = candidateSkillNames(candidate, skills);
    const hits = skillHits(requirement.skills, names);
    const focused = evidenceForSkills(skills, hits);
    const lms = focused.lms;
    const github = focused.github;
    const reviews = Math.max(candidate.reviews, focused.reviews);
    const taskPassed = focused.taskPassed;

    if (requirement.requireLms && lms === 0) continue;
    if (requirement.requireGithub && github === 0) continue;
    if (requirement.requireTask && !taskPassed) continue;
    if (requirement.requireReviews && reviews === 0) continue;
    if (requirement.skills.length > 0 && hits.length < requirement.skills.length) continue;
    const institution = requirement.institution ? normalize(requirement.institution) : "";
    const candidateInstitution = normalize(candidate.institution);
    const institutionHit = Boolean(
      institution
      && candidateInstitution
      && (candidateInstitution.includes(institution) || institution.includes(candidateInstitution) || hasWord(candidateInstitution, institution)),
    );
    if (institution && !institutionHit) continue;
    const verified = verifiedSkillNames(candidate);
    if (requirement.minSkillCount && verified.length < requirement.minSkillCount) continue;

    let score = 0;
    const reasons: string[] = [];

    if (institutionHit && requirement.institution) {
      score += 35;
      reasons.push(`Shared from ${candidate.institution}`);
    }
    if (requirement.minSkillCount) {
      score += 35;
      reasons.push(`${verified.length} shared skills`);
    }
    if (hits.length > 0) {
      score += Math.min(40, hits.length * 28);
      reasons.push(`${hits[0]} is on a shared credential`);
    }
    if (lms > 0) {
      score += 20;
      reasons.push("LMS / Moodle evidence is pre-verified");
    }
    if (github > 0) {
      score += 15;
      reasons.push("GitHub work is attached as corroborating evidence");
    }
    if (taskPassed) {
      score += 15;
      reasons.push("A practical task result was shared");
    }
    if (reviews > 0) {
      score += 10;
      reasons.push(`${reviews} peer review${reviews === 1 ? "" : "s"} disclosed`);
    }
    if (candidate.attestation === "Approved") {
      score += 10;
      reasons.push("Institution attestation is approved");
    }

    if (score < 25) continue;
    ranked.push({
      candidate,
      score: Math.min(99, score),
      reasons: reasons.slice(0, 3),
      matchedSkill: hits[0] ?? candidate.topSkill ?? null,
    });
  }

  return ranked.sort((a, b) => b.score - a.score).slice(0, 8);
}

export function knownSkillsFromDirectory(
  candidates: CandidateView[],
  skillsById: Record<string, CandidateSkill[]>,
): string[] {
  const names = new Set<string>();
  for (const candidate of candidates) {
    for (const skill of candidateSkillNames(candidate, skillsById[candidate.id] ?? [])) {
      names.add(skill);
    }
  }
  return [...names];
}

const COMPARE_STOP = new Set([
  "compare", "compared", "comparison", "profile", "profiles", "with", "and", "vs", "versus",
  "against", "the", "a", "an", "learner", "learners", "candidate", "candidates",
]);

export function isCompareAsk(raw: string): boolean {
  const text = normalize(raw);
  return hasWord(text, "compare") || hasWord(text, "vs") || hasWord(text, "versus") || hasWord(text, "against");
}

export function isPreferenceAsk(raw: string): boolean {
  const text = normalize(raw);
  return /\b(better|best|stronger|strongest)\b/.test(text)
    || /\bwhich (candidate|learner)\b/.test(text)
    || /\bwho is\b/.test(text);
}

function preferenceAnswer(ask: string, matches: RankedMatch[]): string {
  if (matches.length === 0) return `Nobody currently matches “${ask}” on shared evidence.`;
  const leader = matches[0];
  if (matches.length === 1) {
    return `${leader.candidate.name} is the only shared learner who matches “${ask}”.`;
  }
  const runner = matches[1];
  const edge = leader.reasons.find((reason) => !runner.reasons.includes(reason));
  const why = edge ? ` ${leader.candidate.name.split(" ")[0]} has this on the shared profile: ${edge}.` : "";
  return `${leader.candidate.name} is the stronger match for ${ask} on shared evidence, ahead of ${runner.candidate.name} (${leader.score}% vs ${runner.score}%).${why}`;
}

function nameScore(query: string, candidateName: string): number {
  const queryTokens = normalize(query).split(" ").filter((token) => token.length > 1 && !COMPARE_STOP.has(token));
  const nameTokens = normalize(candidateName).split(" ").filter((token) => token.length > 1);
  if (!queryTokens.length || !nameTokens.length) return 0;
  return nameTokens.reduce((score, token) => score + (queryTokens.includes(token) ? 1 : 0), 0);
}

export function findComparePair(raw: string, candidates: CandidateView[]): CandidateView[] {
  const ranked = candidates
    .map((candidate) => ({ candidate, score: nameScore(raw, candidate.name) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.candidate.name.localeCompare(b.candidate.name));

  const picked: CandidateView[] = [];
  for (const item of ranked) {
    if (picked.some((existing) => existing.id === item.candidate.id)) continue;
    picked.push(item.candidate);
    if (picked.length === 2) break;
  }
  return picked;
}

export function candidateEvidenceLines(
  candidate: CandidateView,
  skillsById: Record<string, CandidateSkill[]>,
): string[] {
  const skills = mergeSkillRows(skillsById[candidate.id] ?? [], signalSkills(candidate));
  const names = uniqueSkills(candidateSkillNames(candidate, skills)).slice(0, 4);
  const lms = skills.filter((item) => item.lmsRecords > 0).map((item) => item.skill);
  const github = skills.filter((item) => item.githubRecords > 0).map((item) => item.skill);
  const task = skills.filter((item) => item.practicalTask !== "—").map((item) => item.skill);
  const lines = [
    names.length ? `Skills shared: ${names.join(", ")}` : "No competency names were shared",
    `${candidate.credentialCount} shared credential${candidate.credentialCount === 1 ? "" : "s"} · ${candidate.attestation}`,
  ];
  if (lms.length) lines.push(`Moodle on ${uniqueSkills(lms).slice(0, 3).join(", ")}`);
  if (github.length) lines.push(`GitHub on ${uniqueSkills(github).slice(0, 3).join(", ")}`);
  if (task.length) lines.push(`Practical task on ${uniqueSkills(task).slice(0, 3).join(", ")}`);
  return lines.slice(0, 4);
}

export type LearnerCompare = {
  left: CandidateView;
  right: CandidateView;
  leftLines: string[];
  rightLines: string[];
  summary: string;
};

export function compareLearners(
  left: CandidateView,
  right: CandidateView,
  skillsById: Record<string, CandidateSkill[]>,
): LearnerCompare {
  const leftSkills = uniqueSkills(candidateSkillNames(left, mergeSkillRows(skillsById[left.id] ?? [], signalSkills(left))));
  const rightSkills = uniqueSkills(candidateSkillNames(right, mergeSkillRows(skillsById[right.id] ?? [], signalSkills(right))));
  const shared = leftSkills.filter((skill) => rightSkills.some((other) => namesMatch(skill, other)));
  const onlyLeft = leftSkills.filter((skill) => !rightSkills.some((other) => namesMatch(skill, other)));
  const onlyRight = rightSkills.filter((skill) => !leftSkills.some((other) => namesMatch(skill, other)));

  const parts = [`I compared only what ${left.name} and ${right.name} chose to share.`];
  if (shared.length) parts.push(`Both have ${shared.slice(0, 3).join(", ")}.`);
  if (onlyLeft.length) parts.push(`${left.name.split(" ")[0]} also has ${onlyLeft.slice(0, 3).join(", ")}.`);
  if (onlyRight.length) parts.push(`${right.name.split(" ")[0]} also has ${onlyRight.slice(0, 3).join(", ")}.`);
  if (!shared.length && !onlyLeft.length && !onlyRight.length) {
    parts.push("Neither profile lists a named competency yet.");
  }

  return {
    left,
    right,
    leftLines: candidateEvidenceLines(left, skillsById),
    rightLines: candidateEvidenceLines(right, skillsById),
    summary: parts.join(" "),
  };
}

export function composeCompareReply(found: CandidateView[]): string {
  if (found.length < 2) {
    const named = found[0]?.name;
    return named
      ? `I found ${named}, but I need a second learner name from the directory. Try “compare ${named.split(" ")[0]} with …” and the other name.`
      : "Name two learners in the directory, or ask to compare learners who have a skill and evidence, for example: compare learners with Java projects.";
  }
  return "";
}

export function resolveCompareAsk(
  raw: string,
  candidates: CandidateView[],
  skillsById: Record<string, CandidateSkill[]>,
  knownSkills: string[],
): { compare?: LearnerCompare; matches?: RankedMatch[]; text: string } {
  const named = findComparePair(raw, candidates);
  if (named.length === 2) {
    const compare = compareLearners(named[0], named[1], skillsById);
    return { compare, text: compare.summary };
  }

  const requirement = parseRequirement(raw, knownSkills);
  const hasEvidenceAsk = requirement.skills.length > 0
    || requirement.requireGithub
    || requirement.requireLms
    || requirement.requireTask
    || requirement.requireReviews;

  if (hasEvidenceAsk) {
    const matches = rankCandidatesForRequirement(requirement, candidates, skillsById);
    const ask = requirement.skills.join(", ") || "that evidence";
    if (matches.length >= 2) {
      const compare = compareLearners(matches[0].candidate, matches[1].candidate, skillsById);
      return {
        compare,
        matches: matches.slice(0, 4),
        text: `I compared the learners who match “${ask}” on shared evidence. ${compare.summary}`,
      };
    }
    if (matches.length === 1) {
      return {
        matches,
        text: `Only ${matches[0].candidate.name} currently matches “${ask}” with the evidence you asked for. I need a second matching learner to compare.`,
      };
    }
    return {
      text: `Nobody in the directory shared “${ask}” with the evidence you asked for, so I cannot compare yet.`,
    };
  }

  return { text: composeCompareReply(named) };
}

export type InterpretedIntent = "match" | "compare" | "clarify";

export type InterpretedAsk = {
  intent: InterpretedIntent;
  skills: string[];
  requireLms: boolean;
  requireGithub: boolean;
  requireTask: boolean;
  requireReviews: boolean;
  learnerNames: string[];
  institution?: string | null;
  minSkillCount?: number | null;
  reply: string;
};

const NOT_SKILLS = new Set([
  "github", "git", "repo", "repository", "commit", "project", "projects",
  "lms", "moodle", "course", "coursework", "faculty", "teacher",
  "task", "practical", "review", "reviews", "peer", "evidence", "proof",
  "learner", "learners", "candidate", "candidates", "compare", "skill", "skills",
]);

function aliasKeys(skill: string): Set<string> {
  const key = normalize(skill);
  const keys = new Set<string>([key]);
  for (const alias of ALIASES[key] ?? []) keys.add(normalize(alias));
  for (const [name, aliases] of Object.entries(ALIASES)) {
    if (aliases.some((alias) => normalize(alias) === key)) keys.add(name);
  }
  return keys;
}

function sameSkill(left: string, right: string): boolean {
  if (namesMatch(left, right)) return true;
  const rightKeys = aliasKeys(right);
  for (const key of aliasKeys(left)) {
    if (rightKeys.has(key)) return true;
  }
  return false;
}

const INSTITUTION_STOP = new Set([
  "institution", "university", "college", "from", "the", "of", "and",
  "learner", "learners", "candidate", "candidates", "student", "students",
  "that", "are", "who", "with", "show", "list", "all", "any", "want", "need",
  "please", "shared", "profile", "profiles", "yes", "ok", "okay",
  "a", "an",
]);

function institutionPhrase(raw: string): string | null {
  const text = normalize(raw);
  const patterns = [
    /(?:institution|university|college)\s+of\s+([a-z0-9][a-z0-9 ]{0,40})/,
    /(?:from|at)\s+([a-z0-9][a-z0-9 ]{0,40})/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const phrase = match[1]
      .split(" ")
      .filter((token) => token && !INSTITUTION_STOP.has(token) && !NOT_SKILLS.has(token))
      .slice(0, 4)
      .join(" ");
    if (phrase.length >= 2) return phrase;
  }
  return null;
}

function unboundInstitution(phrase: string | null, knownSkills: string[]): string | null {
  if (!phrase) return null;
  const key = normalize(phrase);
  if (!key || key.length < 3 || NOT_SKILLS.has(key) || INSTITUTION_STOP.has(key)) return null;
  if ([...knownSkills, ...BUILTIN_SKILLS].some((skill) => sameSkill(phrase, skill))) return null;
  return key.length <= 8 ? key.toUpperCase() : phrase;
}

function wantsInstitutionRollup(raw: string, candidates: CandidateView[], knownSkills: string[]): boolean {
  const text = normalize(raw);
  if (!/\b(institution|university|college|campus)\b/.test(text)) return false;
  const named = matchInstitution(raw, candidates.map((candidate) => candidate.institution))
    ?? unboundInstitution(institutionPhrase(raw), knownSkills);
  return !named;
}

function listLearnersByInstitution(candidates: CandidateView[]): string {
  const groups = new Map<string, string[]>();
  for (const candidate of candidates) {
    const institution = candidate.institution?.trim();
    if (!institution || institution === "—") continue;
    const names = groups.get(institution) ?? [];
    names.push(candidate.name);
    groups.set(institution, names);
  }
  if (groups.size === 0) return "No shared learner has an institution on their profile.";
  return [...groups.entries()].map(([institution, names]) => {
    const listed = names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
    return `${listed} ${names.length === 1 ? "is" : "are"} from ${institution}`;
  }).join(". ") + ".";
}

function institutionAnswer(institution: string, matches: RankedMatch[], directory: string[]): string {
  if (matches.length === 0) {
    const elsewhere = [...new Set(directory.map((name) => name.trim()).filter((name) => name && name !== "—" && normalize(name) !== normalize(institution)))];
    const where = elsewhere.length ? ` Shared learners are from ${elsewhere.join(", ")}.` : "";
    return `No shared learner is from ${institution}.${where}`;
  }
  const names = matches.map((match) => match.candidate.name);
  const listed = names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${listed} ${matches.length === 1 ? "is the shared learner" : "are the shared learners"} from ${institution}.`;
}

export function matchInstitution(raw: string, institutions: string[]): string | null {
  const text = normalize(raw);
  if (!text) return null;
  const ranked = institutions
    .map((name) => ({ name: name.trim(), key: normalize(name) }))
    .filter((item) => item.key && item.key !== "—")
    .sort((a, b) => b.key.length - a.key.length);

  for (const item of ranked) {
    if (text.includes(item.key)) return item.name;
    const tokens = item.key.split(" ").filter((token) => token.length >= 3 && !INSTITUTION_STOP.has(token));
    if (tokens.some((token) => hasWord(text, token))) return item.name;
  }
  return null;
}

function hasSearchableAsk(requirement: MatchRequirement): boolean {
  return requirement.skills.length > 0
    || requirement.requireGithub
    || requirement.requireLms
    || requirement.requireTask
    || requirement.requireReviews
    || Boolean(requirement.institution)
    || Boolean(requirement.minSkillCount);
}

function minimumSkillCount(raw: string): number | null {
  const text = normalize(raw);
  const orMore = text.match(/(\d+)\s+or more\s+skills?/);
  if (orMore) return clampSkillCount(orMore[1]);
  const atLeast = text.match(/(?:at least|minimum|min)\s+(\d+)\s+skills?/);
  if (atLeast) return clampSkillCount(atLeast[1]);
  const moreThan = text.match(/more than\s+(\d+)\s+skills?/);
  if (moreThan) return clampSkillCount(String(Number(moreThan[1]) + 1));
  return null;
}

function clampSkillCount(value: string): number | null {
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1 || count > 20) return null;
  return count;
}

function skillCountAnswer(min: number, matches: RankedMatch[]): string {
  if (matches.length === 0) return `No shared learner has ${min} or more skills.`;
  const names = matches.map((match) => match.candidate.name);
  const listed = names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${listed} ${matches.length === 1 ? "has" : "have"} ${min} or more shared skills.`;
}

function understandingPlus(understanding: string, grounded: string): string {
  const lead = understanding.replace(/\s+/g, " ").trim();
  if (!lead) return grounded;
  const sentence = /[.!?]$/.test(lead) ? lead : `${lead}.`;
  return `${sentence} ${grounded}`;
}

export function parseInterpretedAsk(value: unknown): InterpretedAsk | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const intent = row.intent === "compare" || row.intent === "clarify" || row.intent === "match"
    ? row.intent
    : null;
  if (!intent) return null;
  const skills = Array.isArray(row.skills)
    ? row.skills.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 6)
    : [];
  const learnerNames = Array.isArray(row.learnerNames)
    ? row.learnerNames.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 4)
    : [];
  const reply = typeof row.reply === "string" ? row.reply.replace(/\s+/g, " ").trim().slice(0, 500) : "";
  const institution = typeof row.institution === "string" ? row.institution.trim().slice(0, 80) : "";
  return {
    intent,
    skills,
    requireLms: row.requireLms === true,
    requireGithub: row.requireGithub === true,
    requireTask: row.requireTask === true,
    requireReviews: row.requireReviews === true,
    learnerNames,
    institution: institution || null,
    reply,
  };
}

export function requirementFromInterpretation(
  interpreted: InterpretedAsk,
  knownSkills: string[],
): MatchRequirement {
  const skills: string[] = [];
  for (const rawSkill of interpreted.skills) {
    const key = normalize(rawSkill);
    if (!key || NOT_SKILLS.has(key)) continue;
    const known = [...knownSkills, ...BUILTIN_SKILLS].find((skill) => sameSkill(rawSkill, skill));
    skills.push(known ?? rawSkill.trim());
  }
  return {
    raw: interpreted.reply.trim() || skills.join(", "),
    skills: uniqueSkills(skills),
    requireLms: interpreted.requireLms,
    requireGithub: interpreted.requireGithub,
    requireTask: interpreted.requireTask,
    requireReviews: interpreted.requireReviews,
    institution: interpreted.institution ?? null,
    minSkillCount: interpreted.minSkillCount ?? null,
  };
}

function applySkillCountAsk(interpreted: InterpretedAsk, raw: string): InterpretedAsk {
  const min = minimumSkillCount(raw) ?? minimumSkillCount(interpreted.reply);
  if (!min) return interpreted;
  return {
    ...interpreted,
    intent: interpreted.intent === "compare" ? "compare" : "match",
    minSkillCount: min,
    skills: interpreted.skills.filter((skill) => !/^\d+$/.test(skill.trim())),
  };
}

function applyInstitutionAsk(
  interpreted: InterpretedAsk,
  raw: string,
  candidates: CandidateView[],
  knownSkills: string[],
): InterpretedAsk {
  const institutions = [...new Set(candidates.map((candidate) => candidate.institution).filter((name) => name && name !== "—"))];
  const phrase = institutionPhrase(raw);
  const fromQuestion = matchInstitution(raw, institutions)
    ?? matchInstitution(interpreted.institution ?? "", institutions)
    ?? (phrase ? matchInstitution(phrase, institutions) : null)
    ?? unboundInstitution(phrase, knownSkills);
  if (!fromQuestion) {
    return { ...interpreted, institution: matchInstitution(interpreted.institution ?? "", institutions) };
  }
  return {
    ...interpreted,
    intent: interpreted.intent === "compare" ? "compare" : "match",
    institution: fromQuestion,
    skills: interpreted.skills.filter((skill) => !matchInstitution(skill, [fromQuestion])),
    reply: interpreted.reply,
  };
}

export function resolveInterpretedAsk(
  interpreted: InterpretedAsk,
  candidates: CandidateView[],
  skillsById: Record<string, CandidateSkill[]>,
  knownSkills: string[],
  raw = "",
): { compare?: LearnerCompare; matches?: RankedMatch[]; text: string } {
  interpreted = applyInstitutionAsk(interpreted, raw, candidates, knownSkills);
  interpreted = applySkillCountAsk(interpreted, raw);
  if (wantsInstitutionRollup(raw, candidates, knownSkills)) {
    const matches = candidates
      .filter((candidate) => candidate.institution && candidate.institution !== "—")
      .map((candidate) => ({
        candidate,
        score: 35,
        reasons: [`Shared from ${candidate.institution}`],
        matchedSkill: candidate.topSkill ?? null,
      }));
    return { matches, text: listLearnersByInstitution(candidates) };
  }
  const requirement = requirementFromInterpretation(interpreted, knownSkills);
  const searchable = hasSearchableAsk(requirement);
  const clarifyText = interpreted.reply.trim()
    || "Tell me a competency and the proof you need, or name two learners to compare. I only use evidence they already shared.";

  if (
    interpreted.intent === "clarify"
    || (!searchable && interpreted.learnerNames.length < 2 && interpreted.intent !== "compare")
  ) {
    return { text: clarifyText };
  }

  if (interpreted.intent === "compare" && interpreted.learnerNames.length >= 1) {
    const named = findComparePair(interpreted.learnerNames.join(" "), candidates);
    if (named.length === 2) {
      const compare = compareLearners(named[0], named[1], skillsById);
      return { compare, text: understandingPlus(interpreted.reply, compare.summary) };
    }
  }

  if (interpreted.intent === "compare" && searchable) {
    const matches = rankCandidatesForRequirement(requirement, candidates, skillsById);
    const ask = requirement.skills.join(", ") || "that evidence";
    if (matches.length >= 2) {
      const compare = compareLearners(matches[0].candidate, matches[1].candidate, skillsById);
      return {
        compare,
        matches: matches.slice(0, 4),
        text: understandingPlus(
          interpreted.reply,
          `I compared the learners who match “${ask}” on shared evidence. ${compare.summary}`,
        ),
      };
    }
    if (matches.length === 1) {
      return {
        matches,
        text: understandingPlus(
          interpreted.reply,
          `Only ${matches[0].candidate.name} currently matches “${ask}” with the evidence you asked for. I need a second matching learner to compare.`,
        ),
      };
    }
    return {
      text: understandingPlus(
        interpreted.reply,
        `Nobody in the directory shared “${ask}” with the evidence you asked for, so I cannot compare yet.`,
      ),
    };
  }

  if (!searchable) {
    return { text: clarifyText };
  }

  const matches = rankCandidatesForRequirement(requirement, candidates, skillsById);
  if (requirement.minSkillCount && requirement.skills.length === 0 && !requirement.institution && !requirement.requireGithub && !requirement.requireLms && !requirement.requireTask && !requirement.requireReviews) {
    return { matches, text: skillCountAnswer(requirement.minSkillCount, matches) };
  }
  if (requirement.institution && requirement.skills.length === 0 && !requirement.requireGithub && !requirement.requireLms && !requirement.requireTask && !requirement.requireReviews) {
    return {
      matches,
      text: institutionAnswer(
        requirement.institution,
        matches,
        candidates.map((candidate) => candidate.institution),
      ),
    };
  }
  const ask = requirement.skills.length
    ? requirement.skills.join(", ")
    : requirement.institution ?? "that proof";
  if (isPreferenceAsk(raw)) {
    return { matches, text: preferenceAnswer(ask, matches) };
  }
  const grounded = interpreted.reply.trim()
    ? (matches.length === 0
      ? `Nobody currently matches “${ask}” on shared evidence.`
      : `${matches.length} learner${matches.length === 1 ? "" : "s"} match “${ask}” on shared evidence. Hidden fields were not used.`)
    : composeMatchReply(requirement, matches);
  return {
    matches,
    text: understandingPlus(interpreted.reply, grounded),
  };
}

export function resolveRecruiterAsk(
  raw: string,
  candidates: CandidateView[],
  skillsById: Record<string, CandidateSkill[]>,
  knownSkills: string[],
): { compare?: LearnerCompare; matches?: RankedMatch[]; text: string } {
  if (isCompareAsk(raw)) {
    return resolveCompareAsk(raw, candidates, skillsById, knownSkills);
  }
  const requirement = parseRequirement(raw, knownSkills);
  requirement.institution = matchInstitution(
    raw,
    candidates.map((candidate) => candidate.institution),
  );
  const matches = rankCandidatesForRequirement(requirement, candidates, skillsById);
  return { text: composeMatchReply(requirement, matches), matches };
}

export function composeMatchReply(requirement: MatchRequirement, matches: RankedMatch[]): string {
  const ask = requirement.skills.length
    ? requirement.skills.join(", ")
    : requirement.raw;
  if (matches.length === 0) {
    return `I looked only at credentials learners chose to share. Nobody currently matches “${ask}” with the evidence you asked for. Try a competency name, or ask for LMS, GitHub, or a practical task.`;
  }
  const focus = requirement.skills.length
    ? `match “${ask}”`
    : "have the strongest shared evidence right now";
  return `I compared your request to shared SIJIL evidence only — nothing hidden was used. ${matches.length} learner${matches.length === 1 ? "" : "s"} ${focus}. Open a profile to inspect the same Evidence Profile teachers already trust.`;
}
