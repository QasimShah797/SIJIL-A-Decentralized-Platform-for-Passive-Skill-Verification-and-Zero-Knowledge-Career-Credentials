/**
 * Recruiter verification, candidate lookup, and search with selective disclosure.
 */
import { supabaseService } from "./supabase.service";
import { env } from "../config/env";
import { getUserSupabase } from "../config/supabase";
import { AppError } from "../utils/AppError";
import { resolveLearnerDisplayName } from "../utils/learnerDisplayName";
import { CredentialView } from "../types/credentials.types";
import { credentialsService } from "./credentials.service";
import type { SupabaseClient } from "@supabase/supabase-js";

type ShareRow = Record<string, unknown>;
type ProfileRow = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  username?: string | null;
  university_email?: string | null;
  institution_name: string | null;
  skills_summary?: string | null;
  career_goal?: string | null;
  avatar_url?: string | null;
};

export interface DisclosedClaim {
  id: string;
  label: string;
  value: string;
}

export interface SharedCredentialView {
  presentationId: string;
  source: "wallet_share" | "credential_share";
  title: string;
  subtitle: string | null;
  skill: string | null;
  status: "Active";
  selectedFields: string[];
  disclosedFields: DisclosedClaim[];
  disclosedPayload: Record<string, unknown>;
  hiddenFieldCount: number;
  createdAt: string;
  expiresAt: string | null;
  token: string | null;
  proofType: string | null;
}

export interface CandidateView {
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
  skillEvidence?: {
    skill: string;
    githubRecords: number;
    lmsRecords: number;
    reviews: number;
    practicalTask: "Submitted" | "Auto-Submitted" | "—";
  }[];
}

export interface CandidateDetailView extends CandidateView {
  sharedCredentials: SharedCredentialView[];
}

export interface VerifyCredentialResult {
  credential: Partial<CredentialView>;
  disclosedFields: { id: string; label: string; value: string }[];
  presentationStatus: "Active" | "Expired" | "Revoked";
  candidateId?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function isActiveShare(params: {
  revoked?: boolean | null;
  revokedAt?: string | null;
  expiresAt?: string | null;
}): boolean {
  if (params.revoked || params.revokedAt) return false;
  if (!params.expiresAt) return true;
  const expires = new Date(params.expiresAt).getTime();
  if (Number.isNaN(expires)) return true;
  return expires > Date.now();
}

function titleCaseLabel(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function claimValue(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function flattenDisclosedPayload(value: unknown, prefix = ""): DisclosedClaim[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    if (value.length === 0) return [];
    const primitives = value.every((item) => item == null || typeof item !== "object");
    if (primitives) {
      return [{
        id: prefix || "value",
        label: titleCaseLabel(prefix.split(".").pop() || prefix || "Value"),
        value: value.map((item) => claimValue(item)).join(", "),
      }];
    }
    return value.flatMap((item, index) =>
      flattenDisclosedPayload(item, prefix ? `${prefix}.${index}` : String(index)),
    );
  }
  const record = asRecord(value);
  if (record) {
    return Object.entries(record).flatMap(([key, nested]) =>
      flattenDisclosedPayload(nested, prefix ? `${prefix}.${key}` : key),
    );
  }
  if (prefix === "") return [];
  return [{
    id: prefix,
    label: titleCaseLabel(prefix.split(".").pop() || prefix),
    value: claimValue(value),
  }];
}

function mapWalletShare(row: Record<string, unknown>): SharedCredentialView | null {
  if (!isActiveShare({
    revokedAt: asText(row.revoked_at),
    expiresAt: asText(row.expires_at),
  })) {
    return null;
  }

  const payload = asRecord(row.disclosed_payload) ?? {};
  const selectedFields = Array.isArray(row.selected_fields)
    ? row.selected_fields.filter((item): item is string => typeof item === "string")
    : [];
  const disclosedFields = flattenDisclosedPayload(payload);
  if (disclosedFields.length === 0 && Object.keys(payload).length === 0) return null;

  const competency = asRecord(payload.competency);
  const skill = asText(competency?.name);

  return {
    presentationId: asText(row.id) ?? "wallet-share",
    source: "wallet_share",
    title: skill ?? "Shared competency",
    subtitle: asText(competency?.domain),
    skill,
    status: "Active",
    selectedFields,
    disclosedFields,
    disclosedPayload: payload,
    hiddenFieldCount: 0,
    createdAt: asText(row.created_at) ?? new Date().toISOString(),
    expiresAt: asText(row.expires_at),
    token: null,
    proofType: asText(row.proof_type),
  };
}

function mapCredentialShare(row: Record<string, unknown>): SharedCredentialView | null {
  if (!isActiveShare({
    revoked: Boolean(row.revoked),
    expiresAt: asText(row.expires_at),
  })) {
    return null;
  }

  const disclosedFields = Array.isArray(row.disclosed_fields)
    ? row.disclosed_fields.flatMap((item) => {
        const record = asRecord(item);
        if (!record) return [];
        const id = asText(record.id);
        const label = asText(record.label);
        if (!id || !label) return [];
        return [{ id, label, value: claimValue(record.value) }];
      })
    : [];

  if (disclosedFields.length === 0) return null;

  const byId = (id: string) => disclosedFields.find((field) => field.id === id)?.value ?? null;
  const hiddenFields = Array.isArray(row.hidden_fields)
    ? row.hidden_fields.filter((item): item is string => typeof item === "string")
    : [];
  const proof = asRecord(row.proof);

  return {
    presentationId: asText(row.token) ?? "credential-share",
    source: "credential_share",
    title: byId("credentialName") ?? byId("skill") ?? "Shared credential",
    subtitle: byId("issuer"),
    skill: byId("skill"),
    status: "Active",
    selectedFields: disclosedFields.map((field) => field.id),
    disclosedFields,
    disclosedPayload: Object.fromEntries(disclosedFields.map((field) => [field.id, field.value])),
    hiddenFieldCount: hiddenFields.length,
    createdAt: asText(row.created_at) ?? new Date().toISOString(),
    expiresAt: asText(row.expires_at),
    token: asText(row.token),
    proofType: asText(proof?.type),
  };
}

function countDisclosedEvidence(credential: SharedCredentialView): number {
  const summary = credential.disclosedFields.find((field) => field.id === "evidenceSummary");
  if (summary) {
    const match = summary.value.match(/(\d+)/);
    if (match) return Number(match[1]);
  }
  const evidence = asRecord(credential.disclosedPayload.evidence);
  if (!evidence) return 0;
  return Object.values(evidence).reduce<number>((total, item) => {
    if (Array.isArray(item)) return total + item.length;
    const nested = asRecord(item);
    if (!nested) return total;
    return total + Object.values(nested).reduce<number>((inner, value) => (
      inner + (Array.isArray(value) ? value.length : 0)
    ), 0);
  }, 0);
}

function attestationFromShared(credentials: SharedCredentialView[]): CandidateView["attestation"] {
  if (!credentials.length) return "Pending";
  const statuses = credentials.flatMap((credential) => {
    const fromFields = credential.disclosedFields
      .filter((field) => field.id === "verification" || field.id.endsWith("verificationStatus"))
      .map((field) => field.value);
    const status = asRecord(credential.disclosedPayload.status);
    if (asText(status?.verificationStatus)) fromFields.push(String(status?.verificationStatus));
    return fromFields;
  });
  if (!statuses.length) return "Partial";
  const approved = statuses.filter((value) => /verified|approved|attested|issued/i.test(value)).length;
  if (approved === statuses.length) return "Approved";
  if (approved > 0) return "Partial";
  return "Pending";
}

/** Recruiter directory reads bypass learner RLS — route is auth-gated in middleware. */
const DIRECTORY_PROFILE_BASE =
  "user_id, first_name, last_name, username, university_email, institution_name, avatar_url";
const DIRECTORY_PROFILE_SELECT = `${DIRECTORY_PROFILE_BASE}, skills_summary, career_goal`;

function isMissingCareerColumnError(message: string): boolean {
  return /skills_summary|career_goal|column|schema cache/i.test(message);
}

async function fetchAllDirectoryProfiles(client: SupabaseClient = supabaseService.client) {
  const result = await client.from("learner_profiles").select(DIRECTORY_PROFILE_SELECT);
  if (result.error && isMissingCareerColumnError(result.error.message)) {
    return client.from("learner_profiles").select(DIRECTORY_PROFILE_BASE);
  }
  return result;
}

async function fetchDirectoryProfilesByIds(
  ids: string[],
  client: SupabaseClient = supabaseService.client,
) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (!uniqueIds.length) return { data: [] as ProfileRow[], error: null };

  const result = await client
    .from("learner_profiles")
    .select(DIRECTORY_PROFILE_SELECT)
    .in("user_id", uniqueIds);

  if (result.error && isMissingCareerColumnError(result.error.message)) {
    return client.from("learner_profiles").select(DIRECTORY_PROFILE_BASE).in("user_id", uniqueIds);
  }
  return result;
}

function profileCardFields(profile: ProfileRow | null | undefined): Pick<CandidateView, "avatarUrl" | "skillsSummary" | "careerGoal"> {
  return {
    avatarUrl: asText(profile?.avatar_url),
    skillsSummary: asText(profile?.skills_summary),
    careerGoal: asText(profile?.career_goal),
  };
}

async function fetchDirectoryProfile(learnerId: string): Promise<ProfileRow | null> {
  const { data, error } = await fetchDirectoryProfilesByIds([learnerId]);
  if (error) throw new AppError(error.message, 500);
  return (data?.[0] as ProfileRow | undefined) ?? null;
}

function extractDisclosedLearnerName(credentials: SharedCredentialView[]): string | null {
  for (const credential of credentials) {
    const learner = asRecord(credential.disclosedPayload.learner);
    const fromPayload = asText(learner?.name);
    if (fromPayload) return fromPayload;

    const fromField = credential.disclosedFields.find(
      (field) => field.id === "learner.name" || (field.id === "name" && /name/i.test(field.label)),
    );
    if (fromField?.value && fromField.value !== "—") return fromField.value;
  }
  return null;
}

function pickRecruiterDisplayName(...candidates: (string | null | undefined)[]): string {
  for (const name of candidates) {
    const trimmed = name?.trim();
    if (trimmed && trimmed !== "Learner") return trimmed;
  }
  const fallback = candidates.find((name) => name?.trim())?.trim();
  return fallback || "Learner";
}

function extractDisclosedCareerInfo(credentials: SharedCredentialView[]): {
  skillsSummary: string | null;
  careerGoal: string | null;
} {
  let skillsSummary: string | null = null;
  let careerGoal: string | null = null;

  for (const credential of credentials) {
    const learner = asRecord(credential.disclosedPayload.learner);
    if (!skillsSummary) {
      skillsSummary = asText(learner?.skillsSummary) ?? asText(learner?.skills_summary);
    }
    if (!careerGoal) {
      careerGoal = asText(learner?.careerGoal) ?? asText(learner?.career_goal);
    }

    for (const field of credential.disclosedFields) {
      const id = field.id.toLowerCase();
      if (
        !skillsSummary
        && (
          id === "learner.skillssummary"
          || id === "learner.skills_summary"
          || id === "learner_skills_summary"
          || id.endsWith(".skillssummary")
          || id.endsWith(".skills_summary")
          || /skills summary|academic interests/i.test(field.label)
        )
      ) {
        skillsSummary = asText(field.value);
      }
      if (
        !careerGoal
        && (
          id === "learner.careergoal"
          || id === "learner.career_goal"
          || id === "learner_career_goal"
          || id.endsWith(".careergoal")
          || id.endsWith(".career_goal")
          || /career goal/i.test(field.label)
        )
      ) {
        careerGoal = asText(field.value);
      }
    }

    if (skillsSummary && careerGoal) break;
  }

  return { skillsSummary, careerGoal };
}

function resolveCareerFields(
  profile: ProfileRow | null | undefined,
  shares: SharedCredentialView[],
): Pick<CandidateView, "skillsSummary" | "careerGoal"> {
  const fromProfile = profileCardFields(profile);
  const disclosed = extractDisclosedCareerInfo(shares);
  return {
    skillsSummary: fromProfile.skillsSummary ?? disclosed.skillsSummary,
    careerGoal: fromProfile.careerGoal ?? disclosed.careerGoal,
  };
}

function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    : [];
}

function countGithubBlock(value: unknown): { count: number; languages: string[] } {
  const github = asRecord(value);
  if (!github) return { count: 0, languages: [] };
  const rows = [
    ...asRecords(github.repos),
    ...asRecords(github.evidenceRecords),
    ...asRecords(github.activities),
  ];
  return {
    count: rows.length,
    languages: rows
      .map((row) => asText(row.primary_language) ?? asText(row.language))
      .filter((item): item is string => Boolean(item)),
  };
}

function countLmsBlock(value: unknown): number {
  const lms = asRecord(value);
  if (!lms) return 0;
  return asRecords(lms.assignments).length
    + asRecords(lms.evidence).length
    + asRecords(lms.importedEvidence).length
    + asRecords(lms.grades).length
    + asRecords(lms.courses).length;
}

function skillEvidenceFromShares(shares: SharedCredentialView[]): NonNullable<CandidateView["skillEvidence"]> {
  const byName = new Map<string, NonNullable<CandidateView["skillEvidence"]>[number]>();
  const add = (
    skill: string | null,
    patch: Partial<NonNullable<CandidateView["skillEvidence"]>[number]>,
  ) => {
    const name = skill?.trim();
    if (!name || name === "—") return;
    const key = name.toLowerCase();
    const existing = byName.get(key) ?? {
      skill: name,
      githubRecords: 0,
      lmsRecords: 0,
      reviews: 0,
      practicalTask: "—" as const,
    };
    existing.githubRecords += patch.githubRecords ?? 0;
    existing.lmsRecords += patch.lmsRecords ?? 0;
    existing.reviews += patch.reviews ?? 0;
    if (existing.practicalTask === "—" && patch.practicalTask && patch.practicalTask !== "—") {
      existing.practicalTask = patch.practicalTask;
    }
    byName.set(key, existing);
  };

  for (const share of shares) {
    const payload = share.disclosedPayload ?? {};
    const fields = share.selectedFields ?? [];
    const allowGithub = fields.length === 0 || fields.includes("github_evidence") || fields.includes("complete_evidence_package");
    const allowLms = fields.length === 0 || fields.includes("lms_evidence") || fields.includes("complete_evidence_package");
    const packageEvidence = asRecord(payload.evidence) ?? asRecord(payload.complete_evidence_package) ?? {};
    const skillRows = asRecords(payload.skills);
    const rows = skillRows.length > 0
      ? skillRows
      : [{ name: share.skill ?? share.title, evidence: packageEvidence }];
    const usePackageFallback = rows.length <= 1;

    for (const row of rows) {
      const snapshot = asRecord(row.evidence);
      const github = countGithubBlock(snapshot?.github);
      const packageGithub = allowGithub ? countGithubBlock(packageEvidence.github) : { count: 0, languages: [] };
      const githubRecords = snapshot
        ? github.count
        : (usePackageFallback ? packageGithub.count : 0);
      const lmsRecords = snapshot
        ? countLmsBlock(snapshot.lms)
        : (usePackageFallback && allowLms ? countLmsBlock(packageEvidence.lms) : 0);
      const reviews = snapshot
        ? asRecords(snapshot.peerReviews).length
        : (usePackageFallback ? asRecords(packageEvidence.peerReviews).length : 0);
      const practical = snapshot
        ? asRecord(snapshot.practicalTask)
        : (usePackageFallback ? asRecord(packageEvidence.practicalTask) : null);
      const task = practical && (practical.latestAttempt || asRecords(practical.attemptHistory).length)
        ? "Submitted" as const
        : "—" as const;
      add(asText(row.name) ?? share.skill ?? share.title, {
        githubRecords,
        lmsRecords,
        reviews,
        practicalTask: task,
      });
      const languages = snapshot ? github.languages : (usePackageFallback ? packageGithub.languages : []);
      for (const language of languages) {
        add(language, { githubRecords: Math.max(1, githubRecords) });
      }
    }
  }

  return [...byName.values()];
}

function collectCandidateSearchSkills(params: {
  shares?: SharedCredentialView[];
  skillsSummary?: string | null;
  topSkill?: string | null;
}): string[] {
  const values = new Set<string>();
  const add = (value: string | null | undefined) => {
    const trimmed = value?.trim();
    if (trimmed && trimmed !== "—") values.add(trimmed);
  };

  for (const share of params.shares ?? []) {
    add(share.skill);
    add(share.title);
    add(share.subtitle);
    const competency = asRecord(share.disclosedPayload.competency);
    add(asText(competency?.name));
    add(asText(competency?.domain));
    for (const row of asRecords(share.disclosedPayload.skills)) add(asText(row.name));
  }
  for (const signal of skillEvidenceFromShares(params.shares ?? [])) add(signal.skill);

  add(params.topSkill);
  for (const token of (params.skillsSummary ?? "").split(/[,;]+/)) {
    add(token);
  }

  return [...values];
}

function candidateMatchesSkillQuery(candidate: CandidateView, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (candidate.name.toLowerCase().includes(q)) return true;
  if (candidate.institution.toLowerCase().includes(q)) return true;
  if (candidate.topSkill.toLowerCase().includes(q)) return true;
  if (candidate.skillsSummary?.toLowerCase().includes(q)) return true;
  if (candidate.careerGoal?.toLowerCase().includes(q)) return true;
  return (candidate.searchableSkills ?? []).some((skill) => skill.toLowerCase().includes(q));
}

async function resolveDirectoryDisplayName(
  learnerId: string,
  profile?: ProfileRow | null,
): Promise<string> {
  const row = profile ?? await fetchDirectoryProfile(learnerId);
  let name = resolveLearnerDisplayName(row ?? undefined);
  if (name !== "Learner") return name;

  try {
    const { data, error } = await supabaseService.client.auth.admin.getUserById(learnerId);
    if (!error && data?.user) {
      const metaName = data.user.user_metadata?.full_name;
      if (typeof metaName === "string" && metaName.trim()) {
        return metaName.trim();
      }
      const email = data.user.email?.trim();
      if (email) {
        name = resolveLearnerDisplayName({ university_email: email });
        if (name !== "Learner") return name;
      }
    }
  } catch {
    // auth.admin requires a service-role key; ignore when unavailable in dev.
  }

  return name;
}

/** Use service role when configured; otherwise fall back to the recruiter session for RLS. */
function recruiterDb(accessToken?: string): SupabaseClient {
  const hasDedicatedServiceRole = env.SUPABASE_SERVICE_ROLE_KEY !== env.SUPABASE_ANON_KEY;
  if (hasDedicatedServiceRole) return supabaseService.client;
  if (accessToken) return getUserSupabase(accessToken);
  return supabaseService.client;
}

async function fetchActiveShareRows(db: SupabaseClient): Promise<ShareRow[]> {
  const { data, error } = await db
    .from("selective_disclosure_presentations")
    .select("id, learner_id, selected_fields, selection_mode, disclosed_payload, proof_type, expires_at, revoked_at, created_at")
    .is("revoked_at", null);

  if (error) {
    if (/schema cache|does not exist|could not find the table/i.test(error.message)) return [];
    throw new AppError(error.message, 500);
  }

  return (data ?? []).filter((row) =>
    isActiveShare({
      revokedAt: asText(row.revoked_at),
      expiresAt: asText(row.expires_at),
    }),
  ) as ShareRow[];
}

function groupSharesByLearner(rows: ShareRow[]): Map<string, SharedCredentialView[]> {
  const grouped = new Map<string, SharedCredentialView[]>();
  for (const row of rows) {
    const learnerId = asText(row.learner_id);
    if (!learnerId) continue;
    const mapped = mapWalletShare(row);
    if (!mapped) continue;
    const existing = grouped.get(learnerId) ?? [];
    existing.push(mapped);
    grouped.set(learnerId, dedupeSharedCredentials(existing));
  }
  return grouped;
}

function buildCandidateFromShares(
  learnerId: string,
  shares: SharedCredentialView[],
  profile: ProfileRow | null | undefined,
  reviewCount: number,
  displayName: string,
): CandidateView {
  const topSkill = shares.find((item) => item.skill)?.skill ?? "—";
  const evidence = shares.reduce((total, item) => total + countDisclosedEvidence(item), 0);

  const cardFields = profileCardFields(profile);
  const careerFields = resolveCareerFields(profile, shares);

  return {
    id: learnerId,
    name: displayName,
    topSkill,
    evidence,
    reviews: reviewCount,
    attestation: attestationFromShared(shares),
    institution: (profile?.institution_name as string | undefined) ?? "—",
    credentialCount: shares.length,
    avatarUrl: cardFields.avatarUrl,
    skillsSummary: careerFields.skillsSummary,
    careerGoal: careerFields.careerGoal,
    searchableSkills: collectCandidateSearchSkills({
      shares,
      skillsSummary: careerFields.skillsSummary,
      topSkill,
    }),
    skillEvidence: skillEvidenceFromShares(shares),
  };
}

async function listActiveSharedCredentials(
  candidateId: string,
  accessToken?: string,
): Promise<SharedCredentialView[]> {
  const db = recruiterDb(accessToken);
  const [{ data: walletRows, error: walletError }, { data: presentationRows, error: presentationError }] = await Promise.all([
    db
      .from("selective_disclosure_presentations")
      .select("id, selected_fields, selection_mode, disclosed_payload, proof_type, expires_at, revoked_at, created_at")
      .eq("learner_id", candidateId)
      .is("revoked_at", null),
    db
      .from("presentations")
      .select("token, disclosed_fields, hidden_fields, expires_at, revoked, created_at, proof")
      .eq("candidate_user_id", candidateId)
      .eq("revoked", false),
  ]);

  if (walletError && !/schema cache|does not exist|could not find the table/i.test(walletError.message)) {
    throw new AppError(walletError.message, 500);
  }
  if (presentationError && !/schema cache|does not exist|could not find the table/i.test(presentationError.message)) {
    throw new AppError(presentationError.message, 500);
  }

  const shared = [
    ...(walletRows ?? []).map((row) => mapWalletShare(row as Record<string, unknown>)),
    ...(presentationRows ?? []).map((row) => mapCredentialShare(row as Record<string, unknown>)),
  ].filter((item): item is SharedCredentialView => item !== null);

  return dedupeSharedCredentials(
    shared.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
  );
}

function dedupeSharedCredentials(items: SharedCredentialView[]): SharedCredentialView[] {
  const seen = new Set<string>();
  const unique: SharedCredentialView[] = [];
  for (const item of items) {
    const key = (item.skill ?? item.title).trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique;
}

async function countPeerReviews(candidateId: string, accessToken?: string): Promise<number> {
  const { count, error } = await recruiterDb(accessToken)
    .from("peer_reviews")
    .select("*", { count: "exact", head: true })
    .eq("learner_user_id", candidateId);

  if (error) return 0;
  return count ?? 0;
}

export class RecruiterService {
  async verifyCredential(credentialId: string): Promise<VerifyCredentialResult> {
    const { data: presentation } = await supabaseService.client
      .from("presentations")
      .select(`
        *,
        credentials ( credential_uri, name, issuer_name, issuer_did, holder_did, valid_from, verification_status, attestation_status, supporting_records, skill_name, proof, credential_types )
      `)
      .eq("token", credentialId)
      .maybeSingle();

    if (presentation) {
      const isExpired = new Date(presentation.expires_at as string).getTime() < Date.now();
      const status = presentation.revoked
        ? "Revoked"
        : isExpired
          ? "Expired"
          : "Active";

      const cred = presentation.credentials as Record<string, unknown> | null;
      const disclosed = (presentation.disclosed_fields as { id: string; label: string; value: string }[]) ?? [];

      const partialCredential: Partial<CredentialView> = {};
      for (const field of disclosed) {
        switch (field.id) {
          case "credentialName":
            partialCredential.name = field.value;
            break;
          case "skill":
            partialCredential.skill = field.value;
            break;
          case "issuer":
            partialCredential.issuer = field.value;
            break;
          case "validFrom":
            partialCredential.validFrom = field.value;
            break;
          case "holderDid":
            partialCredential.holderDid = field.value;
            break;
          case "issuerDid":
            partialCredential.issuerDid = field.value;
            break;
          default:
            break;
        }
      }

      if (cred) {
        partialCredential.id = cred.credential_uri as string;
        partialCredential.verification = cred.verification_status as string;
        partialCredential.attestation = cred.attestation_status as string;
      }

      return {
        credential: partialCredential,
        disclosedFields: disclosed,
        presentationStatus: status,
        candidateId: presentation.candidate_user_id as string,
      };
    }

    const full = await credentialsService.getByUri(credentialId);
    return {
      credential: {
        id: full.id,
        name: full.name,
        skill: full.skill,
        issuer: full.issuer,
        validFrom: full.validFrom,
        verification: full.verification,
        attestation: full.attestation,
      },
      disclosedFields: [],
      presentationStatus: "Active",
    };
  }

  async getCandidate(candidateId: string, accessToken?: string): Promise<CandidateDetailView | null> {
    const profile = await fetchDirectoryProfile(candidateId);

    const [sharedCredentials, reviewCount, directoryName] = await Promise.all([
      listActiveSharedCredentials(candidateId, accessToken),
      countPeerReviews(candidateId, accessToken),
      resolveDirectoryDisplayName(candidateId, profile),
    ]);

    if (!profile && sharedCredentials.length === 0) return null;

    const name = pickRecruiterDisplayName(extractDisclosedLearnerName(sharedCredentials), directoryName);

    const topSkill = sharedCredentials.find((item) => item.skill)?.skill ?? "—";
    const evidence = sharedCredentials.reduce((total, item) => total + countDisclosedEvidence(item), 0);

    return {
      id: candidateId,
      name,
      topSkill,
      evidence,
      reviews: reviewCount,
      attestation: attestationFromShared(sharedCredentials),
      institution: (profile?.institution_name as string | undefined) ?? "—",
      credentialCount: sharedCredentials.length,
      sharedCredentials,
    };
  }

  async search(query: { q?: string; skill?: string; institution?: string }, accessToken?: string): Promise<CandidateView[]> {
    const db = recruiterDb(accessToken);
    const [{ data: profiles, error: profileError }, shareRows, { data: presentationRows, error: presentationError }] = await Promise.all([
      fetchAllDirectoryProfiles(),
      fetchActiveShareRows(db),
      db
        .from("presentations")
        .select("token, candidate_user_id, disclosed_fields, hidden_fields, expires_at, revoked, created_at, proof")
        .eq("revoked", false),
    ]);

    if (profileError) throw new AppError(profileError.message, 500);
    if (presentationError && !/schema cache|does not exist|could not find the table/i.test(presentationError.message)) {
      throw new AppError(presentationError.message, 500);
    }

    const profileById = new Map<string, ProfileRow>(
      (profiles ?? []).map((row) => [row.user_id as string, row as ProfileRow]),
    );
    const walletSharesByLearner = groupSharesByLearner(shareRows);
    const credentialSharesByLearner = new Map<string, SharedCredentialView[]>();

    for (const row of presentationRows ?? []) {
      const learnerId = asText((row as Record<string, unknown>).candidate_user_id);
      const mapped = mapCredentialShare(row as Record<string, unknown>);
      if (!learnerId || !mapped) continue;
      const existing = credentialSharesByLearner.get(learnerId) ?? [];
      existing.push(mapped);
      credentialSharesByLearner.set(learnerId, existing);
    }

    const learnerIds = new Set<string>([
      ...profileById.keys(),
      ...walletSharesByLearner.keys(),
      ...credentialSharesByLearner.keys(),
    ]);

    if (!learnerIds.size) return [];

    const reviewCounts = await Promise.all(
      [...learnerIds].map(async (learnerId) => ({
        learnerId,
        count: await countPeerReviews(learnerId, accessToken),
      })),
    );
    const reviewsByLearner = new Map(reviewCounts.map((item) => [item.learnerId, item.count]));

    let results: CandidateView[] = await Promise.all([...learnerIds].map(async (learnerId) => {
      const profile = profileById.get(learnerId);
      const walletShares = walletSharesByLearner.get(learnerId) ?? [];
      const credentialShares = credentialSharesByLearner.get(learnerId) ?? [];
      const shared = [...walletShares, ...credentialShares].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      const reviewCount = reviewsByLearner.get(learnerId) ?? 0;
      const directoryName = await resolveDirectoryDisplayName(learnerId, profile);
      const displayName = pickRecruiterDisplayName(extractDisclosedLearnerName(shared), directoryName);

      if (shared.length > 0) {
        return buildCandidateFromShares(learnerId, shared, profile, reviewCount, displayName);
      }

      const cardFields = profileCardFields(profile);
      return {
        id: learnerId,
        name: displayName,
        topSkill: "—",
        evidence: 0,
        reviews: reviewCount,
        attestation: "Pending" as const,
        institution: (profile?.institution_name as string | undefined) ?? "—",
        credentialCount: 0,
        ...cardFields,
        searchableSkills: collectCandidateSearchSkills({
          skillsSummary: cardFields.skillsSummary,
          topSkill: "—",
        }),
      };
    }));

    const q = query.q?.trim().toLowerCase();
    if (q) {
      results = results.filter((c) => candidateMatchesSkillQuery(c, q));
    }

    if (query.institution) {
      const inst = query.institution.toLowerCase();
      results = results.filter((c) => c.institution.toLowerCase().includes(inst));
    }

    if (query.skill) {
      results = results.filter((c) => candidateMatchesSkillQuery(c, query.skill!));
    }

    return results.sort((a, b) => {
      if (a.credentialCount !== b.credentialCount) return b.credentialCount - a.credentialCount;
      return a.name.localeCompare(b.name);
    });
  }

  async getCandidateProfileFields(
    ids: string[],
  ): Promise<Record<string, Pick<CandidateView, "avatarUrl" | "skillsSummary" | "careerGoal">>> {
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    if (!uniqueIds.length) return {};

    const [{ data, error }, shareRows] = await Promise.all([
      fetchDirectoryProfilesByIds(uniqueIds),
      fetchActiveShareRows(supabaseService.client),
    ]);

    if (error) throw new AppError(error.message, 500);

    const sharesByLearner = groupSharesByLearner(
      shareRows.filter((row) => uniqueIds.includes(asText(row.learner_id) ?? "")),
    );

    const fields: Record<string, Pick<CandidateView, "avatarUrl" | "skillsSummary" | "careerGoal">> = {};
    for (const id of uniqueIds) {
      const profileRow = (data ?? []).find((row) => asText((row as ProfileRow).user_id) === id) as ProfileRow | undefined;
      const fromProfile = profileCardFields(profileRow);
      const disclosed = extractDisclosedCareerInfo(sharesByLearner.get(id) ?? []);
      fields[id] = {
        avatarUrl: fromProfile.avatarUrl,
        skillsSummary: fromProfile.skillsSummary ?? disclosed.skillsSummary,
        careerGoal: fromProfile.careerGoal ?? disclosed.careerGoal,
      };
    }
    return fields;
  }
}

export const recruiterService = new RecruiterService();
