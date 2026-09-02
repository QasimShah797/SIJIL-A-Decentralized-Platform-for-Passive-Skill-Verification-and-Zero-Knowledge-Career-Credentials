/**
 * Selective-disclosure helpers for the recruiter candidate view.
 * Recruiters may only see fields a learner explicitly shared in an active presentation.
 */

export type DisclosedClaim = {
  id: string;
  label: string;
  value: string;
};

export type SharedCredentialSource = "wallet_share" | "credential_share";

export type SharedCredentialView = {
  presentationId: string;
  source: SharedCredentialSource;
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
};

export type CandidateDetailView = {
  id: string;
  name: string;
  topSkill: string;
  evidence: number;
  reviews: number;
  attestation: "Approved" | "Partial" | "Pending";
  institution: string;
  credentialCount: number;
  sharedCredentials: SharedCredentialView[];
};

export function isActiveShare(params: {
  revoked?: boolean | null;
  revokedAt?: string | null;
  expiresAt?: string | null;
  now?: number;
}): boolean {
  if (params.revoked) return false;
  if (params.revokedAt) return false;
  if (!params.expiresAt) return true;
  const expires = new Date(params.expiresAt).getTime();
  if (Number.isNaN(expires)) return true;
  return expires > (params.now ?? Date.now());
}

export function titleCaseLabel(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function claimValue(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

/** Flatten a disclosed payload into recruiter-safe claims. Nested objects stay as labeled rows. */
export function flattenDisclosedPayload(
  value: unknown,
  prefix = "",
): DisclosedClaim[] {
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

export function countDisclosedEvidence(credential: SharedCredentialView): number {
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

export function attestationFromShared(
  credentials: SharedCredentialView[],
): CandidateDetailView["attestation"] {
  if (!credentials.length) return "Pending";

  const statuses = credentials.flatMap((credential) => {
    const fromFields = credential.disclosedFields
      .filter((field) => field.id === "verification" || field.id === "verification_status" || field.id.endsWith("verificationStatus"))
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

export function filterActiveSharedCredentials(
  credentials: SharedCredentialView[],
  now = Date.now(),
): SharedCredentialView[] {
  return credentials.filter((credential) =>
    isActiveShare({ expiresAt: credential.expiresAt, now })
    && credential.status === "Active"
    && (credential.disclosedFields.length > 0 || Object.keys(credential.disclosedPayload).length > 0),
  );
}

export function mapWalletShareToView(row: {
  id: unknown;
  selected_fields?: unknown;
  selection_mode?: unknown;
  disclosed_payload?: unknown;
  proof_type?: unknown;
  expires_at?: unknown;
  revoked_at?: unknown;
  created_at?: unknown;
}): SharedCredentialView | null {
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
  const domain = asText(competency?.domain);
  const title = skill ?? (selectedFields.length ? "Shared competency" : "Shared wallet record");

  return {
    presentationId: asText(row.id) ?? "wallet-share",
    source: "wallet_share",
    title,
    subtitle: domain,
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

export function mapCredentialShareToView(row: {
  token?: unknown;
  credential_uri?: unknown;
  disclosed_fields?: unknown;
  hidden_fields?: unknown;
  expires_at?: unknown;
  revoked?: unknown;
  created_at?: unknown;
  proof?: unknown;
}): SharedCredentialView | null {
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
  const title = byId("credentialName") ?? byId("skill") ?? "Shared credential";
  const skill = byId("skill");
  const issuer = byId("issuer");
  const hiddenFields = Array.isArray(row.hidden_fields)
    ? row.hidden_fields.filter((item): item is string => typeof item === "string")
    : [];
  const proof = asRecord(row.proof);

  return {
    presentationId: asText(row.token) ?? "credential-share",
    source: "credential_share",
    title,
    subtitle: issuer,
    skill,
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

export function buildCandidateDetail(params: {
  id: string;
  name: string;
  institution: string;
  reviews: number;
  sharedCredentials: SharedCredentialView[];
}): CandidateDetailView {
  const sharedCredentials = filterActiveSharedCredentials(params.sharedCredentials);
  const disclosedInstitution = extractDisclosedInstitution(sharedCredentials);
  const resolvedName = resolveRecruiterCandidateName(params.name, sharedCredentials);
  const resolvedInstitution = params.institution && params.institution !== "—"
    ? params.institution
    : (disclosedInstitution ?? (params.institution || "—"));
  const topSkill = sharedCredentials.find((item) => item.skill)?.skill ?? "—";

  return {
    id: params.id,
    name: resolvedName,
    topSkill,
    evidence: sharedCredentials.reduce((total, item) => total + countDisclosedEvidence(item), 0),
    reviews: params.reviews,
    attestation: attestationFromShared(sharedCredentials),
    institution: resolvedInstitution,
    credentialCount: sharedCredentials.length,
    sharedCredentials,
  };
}

export function extractDisclosedLearnerName(credentials: SharedCredentialView[]): string | null {
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

export function extractDisclosedInstitution(credentials: SharedCredentialView[]): string | null {
  for (const credential of credentials) {
    const learner = asRecord(credential.disclosedPayload.learner);
    const fromPayload = asText(learner?.institution);
    if (fromPayload) return fromPayload;
  }
  return null;
}

export function extractDisclosedCareerInfo(credentials: SharedCredentialView[]): {
  skillsSummary: string | null;
  careerGoal: string | null;
} {
  let skillsSummary: string | null = null;
  let careerGoal: string | null = null;

  const pickSkillsSummary = (value: unknown) =>
    asText(value) ?? (typeof value === "string" && value.trim() ? value.trim() : null);

  for (const credential of credentials) {
    const learner = asRecord(credential.disclosedPayload.learner);
    if (!skillsSummary) {
      skillsSummary =
        pickSkillsSummary(learner?.skillsSummary)
        ?? pickSkillsSummary(learner?.skills_summary);
    }
    if (!careerGoal) {
      careerGoal =
        pickSkillsSummary(learner?.careerGoal)
        ?? pickSkillsSummary(learner?.career_goal);
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
        skillsSummary = pickSkillsSummary(field.value);
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
        careerGoal = pickSkillsSummary(field.value);
      }
    }

    if (skillsSummary && careerGoal) break;
  }

  return { skillsSummary, careerGoal };
}

/** Prefer disclosed identity over directory stubs such as "Learner". */
export function pickRecruiterDisplayName(...candidates: (string | null | undefined)[]): string {
  for (const name of candidates) {
    const trimmed = name?.trim();
    if (trimmed && trimmed !== "Learner") return trimmed;
  }
  const fallback = candidates.find((name) => name?.trim())?.trim();
  return fallback || "Learner";
}

export function resolveRecruiterCandidateName(
  directoryName: string | null | undefined,
  sharedCredentials: SharedCredentialView[],
): string {
  return pickRecruiterDisplayName(
    extractDisclosedLearnerName(sharedCredentials),
    directoryName,
  );
}

/** All skill-like tokens recruiters can search against for a candidate. */
export function collectCandidateSearchSkills(params: {
  shares?: SharedCredentialView[];
  declaredSkills?: string[];
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
  }

  for (const skill of params.declaredSkills ?? []) add(skill);
  add(params.topSkill);

  for (const token of (params.skillsSummary ?? "").split(/[,;]+/)) {
    add(token);
  }

  return [...values];
}

export function candidateMatchesSkillQuery(
  candidate: {
    name: string;
    institution: string;
    topSkill: string;
    searchableSkills?: string[];
    skillsSummary?: string | null;
    careerGoal?: string | null;
  },
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (candidate.name.toLowerCase().includes(q)) return true;
  if (candidate.institution.toLowerCase().includes(q)) return true;
  if (candidate.topSkill.toLowerCase().includes(q)) return true;
  if (candidate.skillsSummary?.toLowerCase().includes(q)) return true;
  if (candidate.careerGoal?.toLowerCase().includes(q)) return true;
  return (candidate.searchableSkills ?? []).some((skill) => skill.toLowerCase().includes(q));
}
