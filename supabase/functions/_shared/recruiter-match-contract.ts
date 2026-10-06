export const MATCH_INTENTS = ["compare", "find", "rank", "gap", "summary", "other"] as const;

export type MatchIntent = (typeof MATCH_INTENTS)[number];

export type MatchBasis = {
  credentials: number;
  evidence: number;
  verifiedEvidence: number;
};

export type MatchCandidateResult = {
  id: string;
  rank: number | null;
  matchLevel: "full" | "partial" | "none" | "rank" | "count";
  verdict: string;
  strengths: string[];
  gaps: string[];
  matchedVerified: number;
  matchedCorroborating: number;
  basis: MatchBasis;
};

export type MatchComparison = {
  skills: string[];
  rows: Array<{
    candidateId: string;
    cells: Array<{ skill: string; evidenceCount: number; verified: boolean }>;
  }>;
};

export type RecruiterMatchAnswer = {
  intent: MatchIntent;
  headline: string;
  candidates: MatchCandidateResult[];
  comparison: MatchComparison | null;
  notDisclosed: string[];
  followUps: string[];
  caution: string;
  closeNote: string;
};

const hits = new Map<string, number[]>();

export function sanitizeQuestion(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, 500);
}

export function recruiterAccess(input: {
  authenticated: boolean;
  roles: string[] | null;
  roleLookupFailed?: boolean;
}): 200 | 401 | 403 {
  if (!input.authenticated) return 401;
  if (input.roleLookupFailed || !input.roles) return 403;
  return input.roles.some((role) => role === "recruiter" || role === "admin") ? 200 : 403;
}

export function allowMatchRequest(userId: string, now = Date.now()): boolean {
  const recent = (hits.get(userId) ?? []).filter((stamp) => now - stamp < 60_000);
  if (recent.length >= 20) {
    hits.set(userId, recent);
    return false;
  }
  recent.push(now);
  hits.set(userId, recent);
  return true;
}

export function resetMatchRateLimit(): void {
  hits.clear();
}

function text(value: unknown, max = 240): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function strings(value: unknown, limit: number, max = 160): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => text(item, max))
    .filter(Boolean)
    .slice(0, limit);
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

export function validateRecruiterMatchAnswer(value: unknown, allowedIds: string[]): RecruiterMatchAnswer | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const headline = text(row.headline, 400);
  if (!headline) return null;
  const allowed = new Set(allowedIds);
  const intent = MATCH_INTENTS.includes(row.intent as MatchIntent) ? row.intent as MatchIntent : "other";

  const candidates = (Array.isArray(row.candidates) ? row.candidates : []).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Record<string, unknown>;
    const id = text(candidate.id, 80);
    if (!id || !allowed.has(id)) return [];
    const basis = candidate.basis && typeof candidate.basis === "object"
      ? candidate.basis as Record<string, unknown>
      : {};
    const rank = typeof candidate.rank === "number" && Number.isFinite(candidate.rank)
      ? Math.max(1, Math.round(candidate.rank))
      : null;
    const matchLevel: MatchCandidateResult["matchLevel"] = candidate.matchLevel === "full" || candidate.matchLevel === "partial" || candidate.matchLevel === "none" || candidate.matchLevel === "count"
      ? candidate.matchLevel
      : "rank";
    return [{
      id,
      rank,
      matchLevel,
      verdict: text(candidate.verdict, 280),
      strengths: strings(candidate.strengths, 8),
      gaps: strings(candidate.gaps, 4, 40),
      matchedVerified: count(candidate.matchedVerified),
      matchedCorroborating: count(candidate.matchedCorroborating),
      basis: {
        credentials: count(basis.credentials),
        evidence: count(basis.evidence),
        verifiedEvidence: count(basis.verifiedEvidence),
      },
    }];
  }).slice(0, 20);

  let comparison: MatchComparison | null = null;
  if (row.comparison && typeof row.comparison === "object") {
    const source = row.comparison as Record<string, unknown>;
    const skills = strings(source.skills, 8, 40);
    const rows = (Array.isArray(source.rows) ? source.rows : []).flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const line = item as Record<string, unknown>;
      const candidateId = text(line.candidateId, 80);
      if (!candidateId || !allowed.has(candidateId)) return [];
      const cells = (Array.isArray(line.cells) ? line.cells : []).flatMap((cell) => {
        if (!cell || typeof cell !== "object") return [];
        const entry = cell as Record<string, unknown>;
        const skill = text(entry.skill, 40);
        if (!skill) return [];
        return [{ skill, evidenceCount: count(entry.evidenceCount), verified: entry.verified === true }];
      }).slice(0, 8);
      return [{ candidateId, cells }];
    }).slice(0, 20);
    if (skills.length && rows.length) comparison = { skills, rows };
  }

  return {
    intent,
    headline,
    candidates,
    comparison,
    notDisclosed: strings(row.notDisclosed, 6),
    followUps: strings(row.followUps, 3, 120),
    caution: text(row.caution, 160),
    closeNote: text(row.closeNote, 160),
  };
}
