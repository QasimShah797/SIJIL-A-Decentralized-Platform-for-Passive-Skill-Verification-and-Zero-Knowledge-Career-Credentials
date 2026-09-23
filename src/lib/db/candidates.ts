import { fetchAllLearnerProfiles } from "@/lib/db/learner-profile";
import { fetchDeclaredSkillsForUsers } from "@/lib/db/skills";
import { fetchCredentialsForUsers } from "@/lib/db/credentials";
import { fetchPeerReviewsForUsers } from "@/lib/db/peer-reviews";
import { supabase } from "@/integrations/supabase/client";
import { isMissingRelationError, isMissingColumnError } from "@/lib/supabase-errors";
import {
  buildCandidateDetail,
  collectCandidateSearchSkills,
  extractDisclosedCareerInfo,
  mapWalletShareToView,
  mergeSkillEvidence,
  pickRecruiterDisplayName,
  skillEvidenceFromShares,
  type SkillEvidenceSignal,
} from "@/lib/shared-presentation";
import type { SharedCredentialView } from "@/lib/shared-presentation";
import type { CandidateSkill } from "@/lib/sijil-data";

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
  skillEvidence?: SkillEvidenceSignal[];
};

function attestationFromCredentials(creds: { attestation: string }[]): "Approved" | "Partial" | "Pending" {
  if (!creds.length) return "Pending";
  const approved = creds.filter((c) => c.attestation === "Approved").length;
  if (approved === creds.length) return "Approved";
  if (approved > 0) return "Partial";
  return "Pending";
}

async function settle<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch {
    return fallback;
  }
}

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

  try {
    const { data, error } = await (supabase as unknown as {
      from: (table: string) => {
        select: (columns: string) => {
          in: (column: string, values: string[]) => {
            is: (column: string, value: null) => Promise<{ data: Record<string, unknown>[] | null; error: { message?: string } | null }>;
          };
        };
      };
    })
      .from("selective_disclosure_presentations")
      .select("learner_id, selected_fields, selection_mode, disclosed_payload, proof_type, expires_at, revoked_at, created_at")
      .in("learner_id", uniqueIds)
      .is("revoked_at", null);

    if (error) {
      if (isMissingRelationError(error)) return result;
      return result;
    }

    const sharesByLearner = new Map<string, SharedCredentialView[]>();
    for (const row of data ?? []) {
      const mapped = mapWalletShareToView(row);
      const learnerId = typeof row.learner_id === "string" ? row.learner_id : null;
      if (!learnerId || !mapped) continue;
      const bucket = sharesByLearner.get(learnerId) ?? [];
      bucket.push(mapped);
      sharesByLearner.set(learnerId, bucket);
    }

    for (const [learnerId, shares] of sharesByLearner) {
      result.set(learnerId, extractDisclosedCareerInfo(shares));
    }
  } catch {
    return result;
  }

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
    ({ data, error } = await supabase.from("learner_profiles").select(baseSelect).in("user_id", uniqueIds));
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

async function fetchCandidatesFromActiveShares(): Promise<CandidateView[]> {
  try {
    const { data, error } = await (supabase as unknown as {
      from: (table: string) => {
        select: (columns: string) => {
          is: (column: string, value: null) => Promise<{ data: Record<string, unknown>[] | null; error: { message?: string } | null }>;
        };
      };
    })
      .from("selective_disclosure_presentations")
      .select("id, learner_id, selected_fields, selection_mode, disclosed_payload, proof_type, expires_at, revoked_at, created_at")
      .is("revoked_at", null);

    if (error) {
      if (isMissingRelationError(error)) return [];
      throw error;
    }

    const sharesByLearner = new Map<string, ReturnType<typeof mapWalletShareToView>[]>();
    for (const row of data ?? []) {
      const mapped = mapWalletShareToView(row);
      const learnerId = typeof row.learner_id === "string" ? row.learner_id : null;
      if (!learnerId || !mapped) continue;
      const bucket = sharesByLearner.get(learnerId) ?? [];
      bucket.push(mapped);
      sharesByLearner.set(learnerId, bucket);
    }

    if (!sharesByLearner.size) return [];

    const learnerIds = [...sharesByLearner.keys()];
    const profiles = await settle(() => fetchAllLearnerProfiles(), []);
    const profileById = new Map(profiles.map((profile) => [profile.user_id, profile]));
    const reviewsMap = await settle(() => fetchPeerReviewsForUsers(learnerIds), {});

    return learnerIds.map((learnerId) => {
      const shares = sharesByLearner.get(learnerId) ?? [];
      const profile = profileById.get(learnerId);
      const detail = buildCandidateDetail({
        id: learnerId,
        name: profile?.name ?? "Learner",
        institution: profile?.institution ?? "—",
        reviews: reviewsMap[learnerId]?.length ?? 0,
        sharedCredentials: shares.filter((item): item is NonNullable<typeof item> => item !== null),
      });
      const activeShares = shares.filter((item): item is NonNullable<typeof item> => item !== null);
      const career = resolveCareerFields(profile, activeShares);
      return {
        id: detail.id,
        name: detail.name,
        topSkill: detail.topSkill,
        evidence: detail.evidence,
        reviews: detail.reviews,
        attestation: detail.attestation,
        institution: detail.institution,
        credentialCount: detail.credentialCount,
        avatarUrl: profile?.avatarUrl ?? null,
        skillsSummary: career.skillsSummary,
        careerGoal: career.careerGoal,
        searchableSkills: collectCandidateSearchSkills({
          shares: activeShares,
          skillsSummary: career.skillsSummary,
          topSkill: detail.topSkill,
        }),
        skillEvidence: skillEvidenceFromShares(activeShares),
      };
    });
  } catch (error) {
    if (isMissingRelationError(error)) return [];
    throw error;
  }
}

export async function fetchCandidates(): Promise<CandidateView[]> {
  const [profiles, sharedCandidates] = await Promise.all([
    fetchAllLearnerProfiles(),
    fetchCandidatesFromActiveShares(),
  ]);

  if (!profiles.length) {
    return sharedCandidates;
  }

  const userIds = profiles.map((p) => p.user_id);
  const [skillsMap, credsMap, reviewsMap] = await Promise.all([
    settle(() => fetchDeclaredSkillsForUsers(userIds), {}),
    settle(() => fetchCredentialsForUsers(userIds), {}),
    settle(() => fetchPeerReviewsForUsers(userIds), {}),
  ]);

  const profileCandidates = profiles.map((p) => {
    const skills = skillsMap[p.user_id] ?? [];
    const creds = credsMap[p.user_id] ?? [];
    const reviews = reviewsMap[p.user_id] ?? [];
    const sharedMatch = sharedCandidates.find((candidate) => candidate.id === p.user_id);
    const career = {
      skillsSummary: coalesceText(p.skillsSummary, sharedMatch?.skillsSummary),
      careerGoal: coalesceText(p.careerGoal, sharedMatch?.careerGoal),
    };
    const topSkill = skills[0]?.name ?? creds[0]?.skill ?? sharedMatch?.topSkill ?? "—";
    const evidence = skills.reduce((n, s) => n + (s.lastRelatedActivityAt ? 1 : 0), 0)
      + creds.reduce((n, c) => n + c.supportingRecords, 0);

    return {
      id: p.user_id,
      name: pickRecruiterDisplayName(sharedMatch?.name, p.name),
      topSkill,
      evidence: Math.max(evidence, sharedMatch?.evidence ?? 0),
      reviews: Math.max(reviews.length, sharedMatch?.reviews ?? 0),
      attestation: sharedMatch?.attestation ?? attestationFromCredentials(creds),
      institution: p.institution !== "—" ? p.institution : (sharedMatch?.institution ?? p.institution),
      credentialCount: Math.max(creds.length, sharedMatch?.credentialCount ?? 0),
      avatarUrl: p.avatarUrl ?? sharedMatch?.avatarUrl ?? null,
      skillsSummary: coalesceText(career.skillsSummary, sharedMatch?.skillsSummary),
      careerGoal: coalesceText(career.careerGoal, sharedMatch?.careerGoal),
      searchableSkills: mergeSearchableSkills(
        collectCandidateSearchSkills({
          declaredSkills: skills.map((skill) => skill.name),
          skillsSummary: coalesceText(career.skillsSummary, sharedMatch?.skillsSummary),
          topSkill,
        }),
        sharedMatch?.searchableSkills,
      ),
      skillEvidence: mergeSkillEvidence(sharedMatch?.skillEvidence),
    };
  });

  return mergeCandidateLists(profileCandidates, sharedCandidates);
}

export async function fetchCandidateSkillsMap(): Promise<Record<string, CandidateSkill[]>> {
  const profiles = await settle(() => fetchAllLearnerProfiles(), []);
  const userIds = profiles.map((p) => p.user_id);
  const [skillsMap, credsMap, reviewsMap] = await Promise.all([
    settle(() => fetchDeclaredSkillsForUsers(userIds), {}),
    settle(() => fetchCredentialsForUsers(userIds), {}),
    settle(() => fetchPeerReviewsForUsers(userIds), {}),
  ]);

  const result: Record<string, CandidateSkill[]> = {};
  for (const p of profiles) {
    const skills = skillsMap[p.user_id] ?? [];
    const creds = credsMap[p.user_id] ?? [];
    const reviews = reviewsMap[p.user_id] ?? [];

    result[p.user_id] = skills.map((s) => {
      const skillCreds = creds.filter((c) => c.skill.includes(s.name));
      const skillReviews = reviews.filter((r) => r.skill === s.name);
      return {
        skill: s.name,
        domain: s.domain,
        evidence: skillCreds.reduce((n, c) => n + c.supportingRecords, 0) + (s.lastRelatedActivityAt ? 1 : 0),
        reviews: skillReviews.length,
        lmsRecords: 0,
        githubRecords: s.lastRelatedActivityAt ? 1 : 0,
        practicalTask: "—" as const,
        externalCert: "—" as const,
        attestation: skillCreds.some((c) => c.attestation === "Approved") ? "Approved" as const : "Pending" as const,
        attestationSource: p.institution,
        attestationDid: `did:web:issuer.${p.institution.toLowerCase().replace(/\s+/g, "")}.edu.pk`,
        credentialId: skillCreds[0]?.id ?? null,
      };
    });
  }
  return result;
}

export async function fetchCandidateById(id: string): Promise<CandidateView | null> {
  const all = await fetchCandidates();
  return all.find((c) => c.id === id) ?? null;
}
