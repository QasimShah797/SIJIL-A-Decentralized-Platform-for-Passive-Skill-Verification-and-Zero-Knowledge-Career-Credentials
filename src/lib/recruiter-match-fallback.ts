import type { CandidateView } from "@/lib/db/candidates";
import type { CandidateSkill } from "@/lib/sijil-data";
import { getEvidenceStats } from "@/lib/recruiter-evidence";
import type { RecruiterMatchAnswer } from "@/lib/recruiter-match-response";
import {
  competencyFromQuestion,
  displaySkill,
  matchedSkillNames,
  missingSkillNames,
  normalizeSkill,
  parseMatchQuery,
  skillsMatch,
  type CompetencyMatch,
  type CountFilter,
  type MatchQuery,
} from "@/lib/recruiter-skills";

type Scored = {
  id: string;
  name: string;
  score: number;
  level: "full" | "partial" | "none" | "rank" | "count";
  statsCredentials: number;
  evidenceTotal: number;
  verified: number;
  corroborating: number;
  matchedVerified: number;
  matchedCorroborating: number;
  matched: string[];
  missing: string[];
  trust: string[];
  declared: string[];
};

function joinAnd(values: string[]): string {
  if (values.length <= 1) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

function declaredNames(candidate: CandidateView, declared: CandidateSkill[]): string[] {
  const names = [
    ...(candidate.verifiedSkills ?? []),
    ...(candidate.skillStats ?? []).map((row) => row.skill),
    ...(candidate.searchableSkills ?? []),
    ...(candidate.skillEvidence ?? []).map((row) => row.skill),
    ...declared.map((row) => row.skill),
    candidate.topSkill,
  ];
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const name of names) {
    const trimmed = name?.trim() ?? "";
    const key = trimmed.toLowerCase();
    if (!trimmed || trimmed === "—" || seen.has(key)) continue;
    seen.add(key);
    unique.push(trimmed);
  }
  return unique;
}

function scoreCandidate(candidate: CandidateView, declared: CandidateSkill[], question: string, query: MatchQuery, competency: CompetencyMatch): Scored {
  const stats = getEvidenceStats(candidate, question);
  const names = declaredNames(candidate, declared);
  const required = query.intent === "filter" ? query.requiredSkills : [];
  const matched = required.length
    ? required.filter((skill) => names.some((name) => skillsMatch(name, skill))).map(displaySkill)
    : matchedSkillNames(names, competency).map(displaySkill);
  const missing = required.length
    ? required.filter((skill) => !names.some((name) => skillsMatch(name, skill))).map(displaySkill)
    : missingSkillNames(names, competency);
  const matchedVerified = stats.matched.verified;
  const matchedCorroborating = stats.matched.corroborating;
  const overlap = matched.length;
  const score = query.verifiedOnly
    ? matchedVerified * 1_000 + overlap * 100 + matchedCorroborating * 10 + stats.credentials
    : overlap * 1_000 + matchedVerified * 100 + matchedCorroborating * 10 + stats.credentials;
  const trust: string[] = [];
  if (matchedVerified > 0) trust.push("LMS pre-verified");
  else if (!required.length && !competency.skills.length && stats.verified > 0) trust.push("Profile has LMS evidence");
  if (matchedCorroborating > 0) trust.push("GitHub corroborating");
  const level = required.length
    ? (missing.length === 0 ? "full" : matched.length ? "partial" : "none")
    : "rank";
  return {
    id: candidate.id,
    name: candidate.name,
    score,
    level,
    statsCredentials: stats.credentials,
    evidenceTotal: stats.evidenceTotal,
    verified: stats.verified,
    corroborating: stats.corroborating,
    matchedVerified,
    matchedCorroborating,
    matched,
    missing,
    trust,
    declared: names,
  };
}

function evidenceSentence(row: Scored): string {
  if (!row.matched.length) return "";
  return `Evidence on matched skills: ${row.matchedVerified} verified (LMS), ${row.matchedCorroborating} corroborating.`;
}

function verdictFor(row: Scored): string {
  const evidence = evidenceSentence(row);
  if (row.level === "partial") return [`Partial: missing ${joinAnd(row.missing)}.`, evidence].filter(Boolean).join(" ");
  if (row.level === "none") return [`Missing ${joinAnd(row.missing)}.`, evidence].filter(Boolean).join(" ");
  if (row.matched.length) return [`Declares ${joinAnd(row.matched)}.`, evidence].filter(Boolean).join(" ");
  const strongest = row.declared.map(displaySkill).filter((name, index, list) => list.indexOf(name) === index).slice(0, 3);
  return strongest.length ? `Declares ${joinAnd(strongest)}.` : "";
}

function headlineFor(query: MatchQuery, rows: Scored[], competency: CompetencyMatch): string {
  if (query.intent === "filter") {
    const full = rows.filter((row) => row.level === "full").length;
    const verb = full === 1 ? "has" : "have";
    return `${full} of ${rows.length} candidates ${verb} both ${joinAnd(query.requiredSkills)}.`;
  }
  const leader = rows.find((row) => row.level !== "none");
  if (!leader) return `No shared learner has evidence for ${competency.label}.`;
  const reason = leader.matched.length
    ? joinAnd(leader.matched.slice(0, 3))
    : "disclosed skills and evidence";
  return `${leader.name} is the strongest match for ${competency.label} based on ${reason}.`;
}

const BASIC_EXAMPLES = [
  "Which candidates have 2 or more skills",
  "Who has more than 10 evidence",
  "Show candidates with Java and Mobile App Development",
  "Who is best at backend?",
];

function basicModeAnswer(): RecruiterMatchAnswer {
  return {
    intent: "other",
    headline: "Basic mode can't answer this question. Live AI matching is needed for open-ended questions.",
    caution: "",
    closeNote: "",
    candidates: [],
    comparison: null,
    notDisclosed: [],
    followUps: BASIC_EXAMPLES,
  };
}

function thresholdPhrase(count: CountFilter): string {
  const label = count.metric === "verifiedEvidence" ? "verified evidence" : count.metric;
  if (count.operator === ">=") return `${count.value} or more ${label}`;
  if (count.operator === ">") return `more than ${count.value} ${label}`;
  if (count.operator === "<=") return `${count.value} or fewer ${label}`;
  if (count.operator === "<") return `fewer than ${count.value} ${label}`;
  return `exactly ${count.value} ${label}`;
}

function metricValue(count: CountFilter, names: string[], stats: { credentials: number; evidenceTotal: number; verified: number }): number {
  if (count.metric === "skills") return new Set(names.map((name) => normalizeSkill(name)).filter(Boolean)).size;
  if (count.metric === "credentials") return stats.credentials;
  if (count.metric === "verifiedEvidence") return stats.verified;
  return stats.evidenceTotal;
}

function passesThreshold(actual: number, count: CountFilter): boolean {
  if (count.operator === ">=") return actual >= count.value;
  if (count.operator === ">") return actual > count.value;
  if (count.operator === "<=") return actual <= count.value;
  if (count.operator === "<") return actual < count.value;
  return actual === count.value;
}

function skillChips(names: string[]): string[] {
  const seen = new Set<string>();
  const chips: string[] = [];
  for (const name of names) {
    const label = displaySkill(name);
    const key = normalizeSkill(label);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    chips.push(label);
  }
  return chips;
}

function buildCountAnswer(
  count: CountFilter,
  candidates: CandidateView[],
  candidateSkills: Record<string, CandidateSkill[]>,
): RecruiterMatchAnswer {
  const phrase = thresholdPhrase(count);
  const rows = candidates.map((candidate) => {
    const names = declaredNames(candidate, candidateSkills[candidate.id] ?? []);
    const stats = getEvidenceStats(candidate);
    const value = metricValue(count, names, stats);
    return { candidate, names, stats, value, pass: passesThreshold(value, count) };
  }).sort((left, right) => {
    const direction = count.operator === "<" || count.operator === "<=" ? 1 : -1;
    return (left.pass === right.pass ? 0 : left.pass ? -1 : 1) || (left.value - right.value) * direction || left.candidate.name.localeCompare(right.candidate.name);
  });
  const passed = rows.filter((row) => row.pass).length;
  const label = count.metric === "skills" ? "skills" : count.metric === "credentials" ? "credentials" : count.metric === "verifiedEvidence" ? "verified evidence" : "evidence";
  return {
    intent: "find",
    headline: passed === 0
      ? `No candidates have ${phrase}.`
      : `${passed} of ${rows.length} candidates ${passed === 1 ? "has" : "have"} ${phrase}.`,
    caution: passed === 0 ? "Try a lower number, or ask who has a named skill." : "",
    closeNote: "",
    candidates: rows.map((row) => ({
      id: row.candidate.id,
      rank: null,
      matchLevel: row.pass ? "count" as const : "none" as const,
      verdict: `${row.value} ${label}`,
      strengths: count.metric === "skills" ? skillChips(row.names) : [],
      gaps: [],
      matchedVerified: 0,
      matchedCorroborating: 0,
      basis: {
        credentials: row.stats.credentials,
        evidence: row.stats.evidenceTotal,
        verifiedEvidence: row.stats.verified,
      },
    })),
    comparison: null,
    notDisclosed: [],
    followUps: [],
  };
}

function buildUnsupportedSkillAnswer(
  candidates: CandidateView[],
  candidateSkills: Record<string, CandidateSkill[]>,
): RecruiterMatchAnswer {
  const rows = candidates.map((candidate) => {
    const names = declaredNames(candidate, candidateSkills[candidate.id] ?? []);
    const stats = getEvidenceStats(candidate);
    const unsupported = skillChips(names.filter((name) => {
      const evidence = (candidate.skillStats ?? [])
        .filter((row) => skillsMatch(row.skill, name))
        .reduce((sum, row) => sum + row.verified + row.corroborating, 0);
      return evidence === 0;
    }));
    return { candidate, stats, unsupported };
  }).sort((left, right) => right.unsupported.length - left.unsupported.length || left.candidate.name.localeCompare(right.candidate.name));
  const passed = rows.filter((row) => row.unsupported.length > 0).length;
  return {
    intent: "gap",
    headline: passed === 0
      ? "No candidates have skills without supporting evidence."
      : `${passed} of ${rows.length} candidates ${passed === 1 ? "has" : "have"} skills without supporting evidence.`,
    caution: passed === 0 ? "Every declared skill on these profiles has shared evidence." : "",
    closeNote: "",
    candidates: rows.map((row) => ({
      id: row.candidate.id,
      rank: null,
      matchLevel: row.unsupported.length ? "count" as const : "none" as const,
      verdict: row.unsupported.length ? `${row.unsupported.length} skills without evidence` : "Every declared skill has evidence",
      strengths: [],
      gaps: row.unsupported,
      matchedVerified: 0,
      matchedCorroborating: 0,
      basis: {
        credentials: row.stats.credentials,
        evidence: row.stats.evidenceTotal,
        verifiedEvidence: row.stats.verified,
      },
    })),
    comparison: null,
    notDisclosed: [],
    followUps: [],
  };
}

export function buildFallbackMatchAnswer(
  question: string,
  candidates: CandidateView[],
  candidateSkills: Record<string, CandidateSkill[]> = {},
): RecruiterMatchAnswer {
  const pool = candidates.filter((candidate) => (candidate.credentialCount ?? 0) > 0 || (candidate.skillStats?.length ?? 0) > 0 || (candidate.skillEvidence?.length ?? 0) > 0 || (candidate.verifiedSkills?.length ?? 0) > 0 || (candidate.evidence ?? 0) > 0);
  const known = pool.flatMap((candidate) => declaredNames(candidate, candidateSkills[candidate.id] ?? []));
  const query = parseMatchQuery(question, known);
  if (query.intent === "filter_count") return buildCountAnswer(query.count ?? { metric: "skills", operator: ">=", value: 1 }, pool, candidateSkills);
  if (query.intent === "gap" && !query.requiredSkills.length && !query.competencies.length) {
    return buildUnsupportedSkillAnswer(pool, candidateSkills);
  }
  if (query.intent === "summary") return basicModeAnswer();
  if (!query.requiredSkills.length && !query.competencies.length) return basicModeAnswer();
  const competency = query.requiredSkills.length
    ? { id: "explicit", label: query.requiredSkills.join(", "), skills: query.requiredSkills, preferVerified: query.verifiedOnly }
    : competencyFromQuestion(question);
  const order = { full: 0, partial: 1, rank: 2, count: 3, none: 4 };
  const ranked = pool
    .map((candidate) => scoreCandidate(candidate, candidateSkills[candidate.id] ?? [], question, query, competency))
    .sort((left, right) => order[left.level] - order[right.level] || right.score - left.score || right.matchedVerified - left.matchedVerified || left.id.localeCompare(right.id));

  const leader = ranked[0];
  const runner = ranked[1];
  const oneItem = ranked.some((row) => row.level !== "none" && row.matchedVerified + row.matchedCorroborating === 1);
  const close = query.intent === "rank" && Boolean(leader && runner && leader.score > 0 && leader.matched.length > 0 && runner.matched.length > 0 && Math.abs(leader.score - runner.score) / leader.score < 0.1);
  let fullRank = 0;

  return {
    intent: query.intent === "filter" ? "find" : query.intent,
    headline: headlineFor(query, ranked, competency),
    caution: oneItem ? "Only 1 evidence item on matched skills." : "",
    closeNote: close ? "Scores are close; compare both profiles." : "",
    candidates: ranked.map((row) => ({
      id: row.id,
      rank: row.level === "partial" || row.level === "none" ? null : ++fullRank,
      matchLevel: row.level,
      verdict: verdictFor(row),
      strengths: [...row.matched, ...row.trust],
      gaps: row.missing,
      matchedVerified: row.matchedVerified,
      matchedCorroborating: row.matchedCorroborating,
      basis: {
        credentials: row.statsCredentials,
        evidence: row.evidenceTotal,
        verifiedEvidence: row.verified,
      },
    })),
    comparison: null,
    notDisclosed: [],
    followUps: [],
  };
}
