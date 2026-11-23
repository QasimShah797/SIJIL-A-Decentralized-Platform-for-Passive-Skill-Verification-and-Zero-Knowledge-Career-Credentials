import { supabase } from "@/integrations/supabase/client";
import { isMissingColumnError } from "@/lib/supabase-errors";
import {
  extractDisclosedCareerInfo,
  mergeSkillEvidence,
  pickRecruiterDisplayName,
  type SkillEvidenceSignal,
} from "@/lib/shared-presentation";
import type { SharedCredentialView } from "@/lib/shared-presentation";
import type { CandidateSkill } from "@/lib/sijil-data";
import type { EvidenceStats, SkillEvidenceStat } from "@/lib/recruiter-evidence";

export type CandidateView = {
  id: string;
  name: string;
  topSkill: string;
  evidence: number;
  reviews: number;
  attestation: "Approved" | "Partial" | "Pending";
  institution: string;
  credentialCount: number;
  avatarUrl?: string | null;
  skillsSummary?: string | null;
  careerGoal?: string | null;
  searchableSkills?: string[];
  verifiedSkills?: string[];
  skillEvidence?: SkillEvidenceSignal[];
  evidenceStats?: EvidenceStats;
  skillStats?: SkillEvidenceStat[];
  /** Latest active share time, when the directory row includes one. */
  sharedAt?: string | null;
  /** Confirmed private ZKP results across active shares (from API). */
  confirmedPrivateResults?: number;
};

export function coalesceCandidateText(...values: (string | null | undefined)[]): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function coalesceText(...values: (string | null | undefined)[]): string | null {
  return coalesceCandidateText(...values);
}

function mergeSearchableSkills(...lists: (string[] | undefined)[]): string[] {
  return [...new Set(lists.flatMap((list) => list ?? []))];
}

export function latestTimestamp(...values: (string | null | undefined)[]): string | null {
  let best: string | null = null;
  let bestMs = -1;
  for (const value of values) {
    if (!value) continue;
    const ms = new Date(value).getTime();
    if (Number.isNaN(ms) || ms < bestMs) continue;
    bestMs = ms;
    best = value;
  }
  return best;
}

export function mergeCandidateLists(base: CandidateView[], extra: CandidateView[]): CandidateView[] {
  const byId = new Map(base.map((candidate) => [candidate.id, candidate]));
  for (const candidate of extra) {
    const existing = byId.get(candidate.id);
    if (!existing) {
      byId.set(candidate.id, candidate);
      continue;
    }

    const primary = existing.credentialCount >= candidate.credentialCount ? existing : candidate;
    const secondary = primary === existing ? candidate : existing;

    byId.set(candidate.id, {
      ...primary,
      name: pickRecruiterDisplayName(secondary.name, primary.name),
      institution: coalesceText(primary.institution !== "—" ? primary.institution : null, secondary.institution !== "—" ? secondary.institution : null) ?? "—",
      avatarUrl: coalesceText(primary.avatarUrl, secondary.avatarUrl),
      skillsSummary: coalesceText(primary.skillsSummary, secondary.skillsSummary),
      careerGoal: coalesceText(primary.careerGoal, secondary.careerGoal),
      searchableSkills: mergeSearchableSkills(primary.searchableSkills, secondary.searchableSkills),
      skillEvidence: mergeSkillEvidence(primary.skillEvidence, secondary.skillEvidence),
      credentialCount: Math.max(existing.credentialCount, candidate.credentialCount),
      topSkill: primary.topSkill !== "—" ? primary.topSkill : secondary.topSkill,
      evidence: Math.max(primary.evidence, secondary.evidence),
      reviews: Math.max(primary.reviews, secondary.reviews),
      attestation: primary.attestation !== "Pending" ? primary.attestation : secondary.attestation,
      sharedAt: latestTimestamp(primary.sharedAt, secondary.sharedAt),
      confirmedPrivateResults: Math.max(
        primary.confirmedPrivateResults ?? 0,
        secondary.confirmedPrivateResults ?? 0,
      ),
    });
  }
  return [...byId.values()].sort((a, b) => {
    if (a.credentialCount !== b.credentialCount) return b.credentialCount - a.credentialCount;
    return a.name.localeCompare(b.name);
  });
}

function resolveCareerFields(
  profile?: { skillsSummary?: string | null; careerGoal?: string | null } | null,
  shares: SharedCredentialView[] = [],
): Pick<CandidateView, "skillsSummary" | "careerGoal"> {
  const disclosed = extractDisclosedCareerInfo(shares);
  return {
    skillsSummary: coalesceText(profile?.skillsSummary ?? null, disclosed.skillsSummary),
    careerGoal: coalesceText(profile?.careerGoal ?? null, disclosed.careerGoal),
  };
}

function readCareerFromProfileRow(row: Record<string, unknown>): Pick<CandidateView, "avatarUrl" | "skillsSummary" | "careerGoal"> {
  return {
    avatarUrl: typeof row.avatar_url === "string" && row.avatar_url.trim() ? row.avatar_url.trim() : null,
    skillsSummary: typeof row.skills_summary === "string" && row.skills_summary.trim() ? row.skills_summary.trim() : null,
    careerGoal: typeof row.career_goal === "string" && row.career_goal.trim() ? row.career_goal.trim() : null,
  };
}

async function fetchDisclosedCareerByLearnerIds(
  ids: string[],
): Promise<Map<string, Pick<CandidateView, "skillsSummary" | "careerGoal">>> {
  const result = new Map<string, Pick<CandidateView, "skillsSummary" | "careerGoal">>();
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (!uniqueIds.length) return result;
  return result;
}

export async function fetchCandidateCardFieldsByIds(
  ids: string[],
): Promise<Map<string, Pick<CandidateView, "avatarUrl" | "skillsSummary" | "careerGoal">>> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  const result = new Map<string, Pick<CandidateView, "avatarUrl" | "skillsSummary" | "careerGoal">>();
  if (!uniqueIds.length) return result;

  const careerSelect = "user_id, avatar_url, skills_summary, career_goal";
  const baseSelect = "user_id, avatar_url";

  let rows: Record<string, unknown>[] | null = null;
  let { data, error } = await supabase
    .from("learner_profiles")
    .select(careerSelect)
    .in("user_id", uniqueIds);

  if (error && isMissingColumnError(error)) {
    const fallback = await supabase.from("learner_profiles").select(baseSelect).in("user_id", uniqueIds);
    data = fallback.data as typeof data;
    error = fallback.error;
  }

  if (!error) rows = (data ?? []) as Record<string, unknown>[];

  for (const row of rows ?? []) {
    const userId = typeof row.user_id === "string" ? row.user_id : null;
    if (!userId) continue;
    result.set(userId, readCareerFromProfileRow(row));
  }

  const fromShares = await fetchDisclosedCareerByLearnerIds(uniqueIds);
  for (const id of uniqueIds) {
    const profileFields = result.get(id) ?? { avatarUrl: null, skillsSummary: null, careerGoal: null };
    const disclosed = fromShares.get(id);
    result.set(id, {
      avatarUrl: profileFields.avatarUrl,
      skillsSummary: coalesceText(profileFields.skillsSummary, disclosed?.skillsSummary),
      careerGoal: coalesceText(profileFields.careerGoal, disclosed?.careerGoal),
    });
  }

  return result;
}

export function applyCandidateCardFields(
  candidates: CandidateView[],
  fieldsById: Map<string, Pick<CandidateView, "avatarUrl" | "skillsSummary" | "careerGoal">>,
): CandidateView[] {
  return candidates.map((candidate) => {
    const fields = fieldsById.get(candidate.id);
    if (!fields) return candidate;
    return {
      ...candidate,
      avatarUrl: coalesceText(candidate.avatarUrl, fields.avatarUrl),
      skillsSummary: coalesceText(candidate.skillsSummary, fields.skillsSummary),
      careerGoal: coalesceText(candidate.careerGoal, fields.careerGoal),
    };
  });
}

export async function fetchCandidates(): Promise<CandidateView[]> {
  return [];
}

export async function fetchCandidateSkillsMap(): Promise<Record<string, CandidateSkill[]>> {
  return {};
}

export async function fetchCandidateById(id: string): Promise<CandidateView | null> {
  const all = await fetchCandidates();
  return all.find((c) => c.id === id) ?? null;
}
