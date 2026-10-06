import { parseMatchQuery, skillsMatch, taxonomySkills } from "./recruiter-skills.ts";

export type EvidenceStats = {
  credentials: number;
  evidenceTotal: number;
  verified: number;
  corroborating: number;
  matched: { verified: number; corroborating: number };
};

export type SkillEvidenceStat = {
  skill: string;
  verified: number;
  corroborating: number;
};

export type EvidenceAnalysis = {
  stats: EvidenceStats;
  skills: SkillEvidenceStat[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    : [];
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Stable id for one evidence record. Commits and files are not records. */
function recordId(row: Record<string, unknown>, fallback: string): string {
  const raw = row.id ?? row.external_id ?? row.evidence_record_id ?? row.url ?? row.html_url;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (typeof raw === "number") return String(raw);
  const name = asText(row.name) || asText(row.full_name) || asText(row.assignment_name) || asText(row.title);
  return name ? `name:${name.toLowerCase()}` : fallback;
}

function addList(target: Set<string>, rows: unknown, prefix: string) {
  asRecords(rows).forEach((row, index) => {
    target.add(recordId(row, `${prefix}:${index}`));
  });
}

function addSnapshot(verified: Set<string>, corroborating: Set<string>, snapshot: unknown, prefix: string) {
  const record = asRecord(snapshot);
  if (!record) return;
  const lms = asRecord(record.lms);
  addList(verified, lms?.evidence, `${prefix}:lms`);
  addList(verified, lms?.importedEvidence, `${prefix}:lms-imported`);
  addList(verified, lms?.assignments, `${prefix}:lms-assignment`);
  addList(verified, lms?.grades, `${prefix}:lms-grade`);
  const github = asRecord(record.github);
  addList(corroborating, github?.evidenceRecords, `${prefix}:github`);
  const practical = asRecord(record.practicalTask);
  const history = asRecords(practical?.attemptHistory);
  if (history.length) {
    addList(corroborating, history, `${prefix}:task`);
  } else if (practical?.latestAttempt) {
    const attempt = asRecord(practical.latestAttempt);
    corroborating.add(attempt ? recordId(attempt, `${prefix}:task:latest`) : `${prefix}:task:latest`);
  }
}

function isDev(): boolean {
  try {
    return Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);
  } catch {
    return false;
  }
}

function finish(verified: Set<string>, corroborating: Set<string>, credentials: number): EvidenceStats {
  for (const id of verified) corroborating.delete(id);
  const stats = {
    credentials,
    verified: verified.size,
    corroborating: corroborating.size,
    evidenceTotal: verified.size + corroborating.size,
    matched: { verified: 0, corroborating: 0 },
  };
  warnIfBroken(stats);
  return stats;
}

function warnIfBroken(stats: EvidenceStats) {
  if (stats.verified + stats.corroborating === stats.evidenceTotal) return;
  if (isDev()) console.warn("getEvidenceStats: verified + corroborating must equal evidenceTotal");
}

/** One count for every share a recruiter can see. The same record on many credentials counts once. */
export function analyzeDisclosedPayloads(payloads: unknown[]): EvidenceAnalysis {
  const verified = new Set<string>();
  const corroborating = new Set<string>();
  const bySkill = new Map<string, { skill: string; verified: Set<string>; corroborating: Set<string> }>();

  for (const payload of payloads) {
    const record = asRecord(payload) ?? {};
    const packageEvidence = asRecord(record.evidence) ?? asRecord(record.complete_evidence_package);
    const skillRows = asRecords(record.skills);
    let sawSkillSnapshot = false;

    for (const row of skillRows) {
      const name = asText(row.name);
      const snapshot = asRecord(row.evidence);
      if (!name || !snapshot) continue;
      sawSkillSnapshot = true;
      const skillVerified = new Set<string>();
      const skillCorroborating = new Set<string>();
      addSnapshot(skillVerified, skillCorroborating, snapshot, name.toLowerCase());
      const key = name.toLowerCase();
      const existing = bySkill.get(key) ?? { skill: name, verified: new Set<string>(), corroborating: new Set<string>() };
      skillVerified.forEach((id) => {
        existing.verified.add(id);
        verified.add(id);
      });
      skillCorroborating.forEach((id) => {
        existing.corroborating.add(id);
        corroborating.add(id);
      });
      bySkill.set(key, existing);
    }

    if (!sawSkillSnapshot && packageEvidence) {
      addSnapshot(verified, corroborating, packageEvidence, "package");
    }
  }

  const stats = finish(verified, corroborating, payloads.length);
  return {
    stats,
    skills: [...bySkill.values()].map((entry) => {
      for (const id of entry.verified) entry.corroborating.delete(id);
      return {
        skill: entry.skill,
        verified: entry.verified.size,
        corroborating: entry.corroborating.size,
      };
    }),
  };
}

export function evidenceStatsFromPayloads(payloads: unknown[]): EvidenceStats {
  return analyzeDisclosedPayloads(payloads).stats;
}

type StoredStats = {
  credentials: number;
  evidenceTotal?: number;
  verified: number;
  corroborating: number;
  matched?: { verified: number; corroborating: number };
};

type EvidenceStatsSource = {
  credentialCount?: number;
  evidence?: number;
  evidenceStats?: StoredStats | null;
  skillStats?: SkillEvidenceStat[] | null;
  disclosedPayloads?: unknown[] | null;
  sharedCredentials?: { disclosedPayload?: unknown; disclosedFields?: { id: string; value: string }[] }[] | null;
};

function matchedFromSkills(skills: SkillEvidenceStat[], question: string | undefined, totals: Pick<EvidenceStats, "verified" | "corroborating">) {
  if (!question) return { verified: 0, corroborating: 0 };
  const query = parseMatchQuery(question, skills.map((row) => row.skill));
  const targets = query.requiredSkills.length
    ? query.requiredSkills
    : query.competencies.flatMap((id) => taxonomySkills(id));
  const rows = targets.length
    ? skills.filter((row) => targets.some((skill) => skillsMatch(row.skill, skill)))
    : [];
  return {
    verified: Math.min(totals.verified, rows.reduce((sum, row) => sum + row.verified, 0)),
    corroborating: Math.min(totals.corroborating, rows.reduce((sum, row) => sum + row.corroborating, 0)),
  };
}

function summaryCount(payload: unknown, fields?: { id: string; value: string }[]): number | null {
  const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const field = fields?.find((item) => item.id === "evidenceSummary")?.value;
  const raw = typeof field === "string" ? field : typeof record.evidenceSummary === "string" ? record.evidenceSummary : "";
  const match = raw.match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

/** Sum of evidenceSummary on each payload. Zero when the shares do not carry that field. */
export function directoryCountFromPayloads(payloads: unknown[]): number {
  const totals = payloads.map((payload) => summaryCount(payload));
  if (totals.every((value) => value == null)) return 0;
  return totals.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

/** Same total the directory card shows: the evidence summary on each share, summed once per credential. */
export function directoryEvidenceTotal(
  credentials: { disclosedPayload?: unknown; disclosedFields?: { id: string; value: string }[] }[],
): number | null {
  const totals = credentials.map((item) => summaryCount(item.disclosedPayload, item.disclosedFields));
  if (totals.every((value) => value == null)) return null;
  return totals.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

function withMatched(stats: EvidenceStats, skills: SkillEvidenceStat[], question?: string): EvidenceStats {
  const evidenceTotal = stats.verified + stats.corroborating;
  if (stats.evidenceTotal !== evidenceTotal) warnIfBroken({ ...stats, evidenceTotal: stats.evidenceTotal });
  const next = {
    credentials: stats.credentials,
    verified: stats.verified,
    corroborating: stats.corroborating,
    evidenceTotal,
    matched: matchedFromSkills(skills, question, stats),
  };
  warnIfBroken(next);
  return next;
}

/** Same totals for the directory, match cards, Review header, and match context. */
export function getEvidenceStats(candidate: EvidenceStatsSource, question?: string): EvidenceStats {
  const shares = candidate.sharedCredentials ?? null;
  const payloads = candidate.disclosedPayloads
    ?? shares?.map((item) => item.disclosedPayload)
    ?? null;
  const summaryTotal = shares ? directoryEvidenceTotal(shares) : null;
  if (payloads) {
    const analysis = analyzeDisclosedPayloads(payloads);
    const evidenceTotal = Math.max(
      summaryTotal ?? 0,
      directoryCountFromPayloads(payloads),
      candidate.evidence ?? 0,
      analysis.stats.verified + analysis.stats.corroborating,
    );
    const verified = Math.min(analysis.stats.verified, evidenceTotal);
    return withMatched({
      credentials: Math.max(candidate.credentialCount ?? 0, analysis.stats.credentials, shares?.length ?? payloads.length),
      verified,
      corroborating: evidenceTotal - verified,
      evidenceTotal,
      matched: { verified: 0, corroborating: 0 },
    }, analysis.skills, question);
  }
  const stored = candidate.evidenceStats;
  const storedTotal = stored ? stored.verified + stored.corroborating : 0;
  const evidenceTotal = Math.max(candidate.evidence ?? 0, summaryTotal ?? 0, storedTotal);
  const verified = Math.min(stored?.verified ?? 0, evidenceTotal);
  return withMatched({
    credentials: Math.max(candidate.credentialCount ?? 0, stored?.credentials ?? 0),
    verified,
    corroborating: evidenceTotal - verified,
    evidenceTotal,
    matched: stored?.matched ?? { verified: 0, corroborating: 0 },
  }, candidate.skillStats ?? [], question);
}

/** Width of the matched-verified bar. Null means hide every bar. */
export function matchedBarPercent(matchedVerified: number, peak: number, evidenceTotal: number): number | null {
  if (peak <= 0) return null;
  if (evidenceTotal <= 0 || matchedVerified <= 0) return 0;
  return Math.round((matchedVerified / peak) * 100);
}
