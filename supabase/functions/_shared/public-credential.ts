import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

export type PublicShareStatus = "valid" | "revoked" | "expired" | "invalid";

export function corsHeaders(origin = "*"): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };
}

export function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json",
      "Cache-Control": status === 200 ? "public, max-age=30, must-revalidate" : "no-store",
      ...extra,
    },
  });
}

export function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function canonicalizeJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalizeJson(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalizeJson(record[key])}`).join(",")}}`;
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256Hex(secret: string, input: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export type PresentationRow = {
  id: string;
  learner_id: string;
  competency_id: string;
  selected_fields: string[];
  selection_mode: string;
  disclosed_payload: Record<string, unknown>;
  payload_hash: string;
  proof_type: string;
  proof_value: string | null;
  verification_method: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export async function loadPresentationByToken(token: string): Promise<PresentationRow | null> {
  const tokenHash = await sha256Hex(token);
  const { data, error } = await serviceClient()
    .from("selective_disclosure_presentations")
    .select("*")
    .eq("share_token_hash", tokenHash)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  return {
    id: String(row.id ?? ""),
    learner_id: String(row.learner_id ?? ""),
    competency_id: String(row.competency_id ?? ""),
    selected_fields: Array.isArray(row.selected_fields)
      ? row.selected_fields.filter((item): item is string => typeof item === "string")
      : [],
    selection_mode: String(row.selection_mode ?? "custom"),
    disclosed_payload: row.disclosed_payload && typeof row.disclosed_payload === "object"
      ? row.disclosed_payload as Record<string, unknown>
      : {},
    payload_hash: String(row.payload_hash ?? ""),
    proof_type: String(row.proof_type ?? "SignedSelectiveDisclosure"),
    proof_value: typeof row.proof_value === "string" ? row.proof_value : null,
    verification_method: typeof row.verification_method === "string" ? row.verification_method : null,
    expires_at: typeof row.expires_at === "string" ? row.expires_at : null,
    revoked_at: typeof row.revoked_at === "string" ? row.revoked_at : null,
    created_at: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
  };
}

export async function verifyPresentation(row: PresentationRow): Promise<{
  status: PublicShareStatus;
  verified: boolean;
  verifiedAt: string;
}> {
  const verifiedAt = new Date().toISOString();
  if (row.revoked_at) return { status: "revoked", verified: false, verifiedAt };
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    return { status: "expired", verified: false, verifiedAt };
  }

  const payloadHash = await sha256Hex(canonicalizeJson(row.disclosed_payload));
  const payloadHashMatches = payloadHash === row.payload_hash;
  const secret = Deno.env.get("PRESENTATION_SIGNING_SECRET") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const learnerDid = row.verification_method?.split("#")[0] ?? null;
  const proofMaterial = canonicalizeJson({
    learnerDid,
    competencyId: row.competency_id,
    learnerId: row.learner_id,
    payloadHash: row.payload_hash,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  });
  const expected = `0x${await hmacSha256Hex(secret, proofMaterial)}`;
  const proofValid = Boolean(row.proof_value) && row.proof_value === expected;

  if (payloadHashMatches && proofValid) {
    return { status: "valid", verified: true, verifiedAt };
  }
  return { status: "invalid", verified: false, verifiedAt };
}

export function walletExportAvailability() {
  return {
    apple: Boolean(
      Deno.env.get("APPLE_PASS_CERT")
      && Deno.env.get("APPLE_PASS_KEY")
      && Deno.env.get("APPLE_PASS_TYPE_ID")
      && Deno.env.get("APPLE_PASS_TEAM_ID"),
    ),
    google: Boolean(Deno.env.get("GOOGLE_WALLET_ISSUER_ID") && Deno.env.get("GOOGLE_WALLET_SA_KEY")),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => isRecord(item)) : [];
}

export function publicCompetencyPath(shareToken: string, competencyId: string): string {
  return `/credential/${encodeURIComponent(shareToken)}/competency/${encodeURIComponent(competencyId)}`;
}

export function buildAtsResume(
  payload: Record<string, unknown>,
  shareToken: string,
  fallbackCompetencyId?: string | null,
) {
  const learner = isRecord(payload.learner) ? payload.learner : {};
  const contact = isRecord(learner.contact) ? learner.contact : {};
  const evidence = isRecord(payload.evidence) ? payload.evidence : {};
  const github = isRecord(evidence.github) ? evidence.github : {};
  const complete = isRecord(evidence.completeEvidencePackage) ? evidence.completeEvidencePackage : {};
  const completeGithub = isRecord(complete.github) ? complete.github : {};
  const skills: Array<{ competencyId: string; name: string; href: string; ledger?: ReturnType<typeof buildEvidenceLedger> }> = [];
  const seen = new Set<string>();
  const pushSkill = (competencyId: string, name: string) => {
    const key = `${competencyId}:${name.toLowerCase()}`;
    if (!name || seen.has(key)) return;
    seen.add(key);
    skills.push({ competencyId, name, href: publicCompetencyPath(shareToken, competencyId) });
  };
  for (const row of asRecords(payload.skills)) {
    const name = asText(row.name);
    if (name) pushSkill(asText(row.competencyId) || fallbackCompetencyId || name, name);
  }
  const competency = isRecord(payload.competency) ? payload.competency : {};
  if (asText(competency.name)) {
    pushSkill(asText(competency.competencyId) || fallbackCompetencyId || asText(competency.name), asText(competency.name));
  }

  const workExperience: Array<{ title: string; organization: string; detail: string; dates?: string }> = [];
  const seenOrg = new Set<string>();
  for (const repo of [...asRecords(github.repos), ...asRecords(completeGithub.repos)]) {
    const organization = asText(repo.full_name) || asText(repo.repo_name) || asText(repo.name);
    if (!organization || seenOrg.has(organization.toLowerCase())) continue;
    seenOrg.add(organization.toLowerCase());
    workExperience.push({
      title: "Software project",
      organization,
      detail: [asText(repo.primary_language) || asText(repo.language), repo.commit_count != null ? `${repo.commit_count} commits` : "", asText(repo.description)].filter(Boolean).join(" · "),
      dates: asText(repo.updated_at ?? repo.last_commit_at ?? repo.created_at) || undefined,
    });
  }

  const institution = asText(learner.institution);
  return {
    name: asText(learner.name) || "Learner",
    headline: asText(learner.program) || asText(competency.domain) || skills[0]?.name || undefined,
    photoUrl: learner.photoHidden === true
      ? undefined
      : asText(learner.photoUrl ?? learner.avatarUrl ?? learner.avatar_url) || undefined,
    contact: {
      email: asText(contact.email ?? learner.email) || undefined,
      phone: asText(contact.phone ?? learner.phone) || undefined,
      location: asText(learner.cityCountry) || undefined,
    },
    professionalSummary: [asText(learner.careerGoal), asText(learner.skillsSummary)].filter(Boolean).join(" ") || null,
    workExperience,
    education: institution
      ? [{ institution, program: asText(learner.program) || undefined, location: asText(learner.cityCountry) || undefined }]
      : [],
    skills: skills.map((skill) => ({
      ...skill,
      ledger: buildEvidenceLedger(payload, skill.competencyId, [
        "lms_evidence",
        "github_evidence",
        "practical_task_result",
        "peer_reviews",
        "teacher_feedback",
        "complete_evidence_package",
      ]),
    })),
    certifications: asRecords(payload.credentialMetadata).map((row) => ({
      name: asText(row.skill_name) || asText(row.name) || asText(row.title) || "Issued credential",
      issuer: asText(row.issuer_name ?? row.issuer) || undefined,
      issuedAt: asText(row.issued_at ?? row.created_at) || undefined,
    })).filter((item) => item.name),
  };
}

export function competencyFromSharePayload(
  payload: Record<string, unknown>,
  competencyId: string,
  fallbackCompetencyId?: string | null,
) {
  const skill = asRecords(payload.skills).find((row) => asText(row.competencyId) === competencyId);
  if (skill && asText(skill.name)) {
    return {
      competencyId,
      name: asText(skill.name),
      domain: asText(skill.domain) || undefined,
      description: asText(skill.description) || undefined,
    };
  }
  const competency = isRecord(payload.competency) ? payload.competency : {};
  const primaryId = asText(competency.competencyId) || fallbackCompetencyId;
  if (primaryId === competencyId && asText(competency.name)) {
    return {
      competencyId,
      name: asText(competency.name),
      domain: asText(competency.domain) || undefined,
      description: asText(competency.description) || undefined,
    };
  }
  return null;
}

export function buildEvidenceLedger(
  payload: Record<string, unknown>,
  competencyId: string,
  selectedFields: string[],
) {
  const evidence = isRecord(payload.evidence) ? payload.evidence : {};
  const complete = isRecord(evidence.completeEvidencePackage) ? evidence.completeEvidencePackage : {};
  const matched = asRecords(payload.skills).find((row) => asText(row.competencyId) === competencyId);
  const hasSkillSnapshot = isRecord(matched?.evidence);
  const skillEvidence = hasSkillSnapshot ? matched.evidence : {};
  const packageEvidence = Object.keys(complete).length > 0
    ? complete
    : (hasSkillSnapshot ? skillEvidence : evidence);
  const snapshotLms = isRecord(skillEvidence.lms) ? skillEvidence.lms : {};
  const snapshotGithub = isRecord(skillEvidence.github) ? skillEvidence.github : {};
  const lms = Object.keys(snapshotLms).length > 0
    ? snapshotLms
    : (isRecord(packageEvidence.lms) ? packageEvidence.lms : {});
  const github = Object.keys(snapshotGithub).length > 0
    ? snapshotGithub
    : (isRecord(packageEvidence.github) ? packageEvidence.github : {});
  const include = (field: string) =>
    selectedFields.includes(field)
    || selectedFields.includes("complete_evidence_package")
    || (field === "lms_evidence" && hasSkillSnapshot && Object.keys(snapshotLms).length > 0)
    || (field === "github_evidence" && hasSkillSnapshot && Object.keys(snapshotGithub).length > 0)
    || (field === "practical_task_result" && hasSkillSnapshot && Boolean(skillEvidence.practicalTask))
    || (field === "peer_reviews" && hasSkillSnapshot && Boolean(skillEvidence.peerReviews))
    || (field === "teacher_feedback" && hasSkillSnapshot && Boolean(skillEvidence.teacherFeedback));
  const items: Array<Record<string, unknown>> = [];

  if (include("lms_evidence")) {
    [...asRecords(lms.assignments), ...asRecords(lms.evidence), ...asRecords(lms.importedEvidence)].forEach((row, index) => {
      items.push({
        id: `lms-${index}`,
        source: "lms",
        title: asText(row.assignment_name) || asText(row.name) || "LMS evidence",
        detail: [asText(row.course_name) || "LMS", row.grade != null ? `Grade ${row.grade}` : ""].filter(Boolean).join(" · "),
        status: asText(row.status) || "LMS pre-verified",
        timestamp: selectedFields.includes("timestamps") ? asText(row.updated_at ?? row.created_at) || null : null,
        trustTier: "lms_preverified",
        trustTierLabel: "LMS pre-verified",
      });
    });
  }
  if (include("github_evidence")) {
    [...asRecords(github.repos), ...asRecords(github.evidenceRecords)].forEach((row, index) => {
      items.push({
        id: `github-${index}`,
        source: "github",
        title: asText(row.full_name) || asText(row.repo_name) || asText(row.name) || "GitHub evidence",
        detail: asText(row.primary_language) || asText(row.description) || "GitHub activity linked to this competency",
        status: asText(row.status) || "Synced",
        timestamp: selectedFields.includes("timestamps") ? asText(row.updated_at ?? row.created_at) || null : null,
        trustTier: "corroborating",
        trustTierLabel: "Corroborating",
      });
    });
  }
  if (include("practical_task_result")) {
    const practical = isRecord(packageEvidence.practicalTask) ? packageEvidence.practicalTask : {};
    const attempts = [
      ...(isRecord(practical.latestAttempt) ? [practical.latestAttempt] : []),
      ...asRecords(practical.attemptHistory),
    ];
    attempts.forEach((row, index) => {
      items.push({
        id: `task-${index}`,
        source: "practical_task",
        title: asText(row.title) || "Practical task",
        detail: row.scorePercent != null ? `${row.scorePercent}%` : asText(row.status) || "Practical task result",
        status: asText(row.status) || (row.passed === true ? "Passed" : "Submitted"),
        timestamp: asText(row.submittedAt ?? row.submitted_at) || null,
        trustTier: "corroborating",
        trustTierLabel: "Corroborating",
      });
    });
  }
  if (include("peer_reviews")) {
    asRecords(packageEvidence.peerReviews).forEach((row, index) => {
      items.push({
        id: `review-${index}`,
        source: "peer_review",
        title: asText(row.reviewer_name) || "Peer review",
        detail: asText(row.review_text) || asText(row.comment) || "Peer review submitted",
        status: asText(row.status) || "Reviewed",
        timestamp: selectedFields.includes("timestamps") ? asText(row.created_at) || null : null,
        trustTier: "corroborating",
        trustTierLabel: "Corroborating",
      });
    });
  }
  if (include("teacher_feedback")) {
    asRecords(packageEvidence.teacherFeedback).forEach((row, index) => {
      items.push({
        id: `teacher-${index}`,
        source: "teacher_feedback",
        title: asText(row.source) || "Teacher feedback",
        detail: asText(row.feedback_text) || "Feedback recorded",
        status: "LMS pre-verified",
        timestamp: selectedFields.includes("timestamps") ? asText(row.created_at) || null : null,
        trustTier: "lms_preverified",
        trustTierLabel: "LMS pre-verified",
      });
    });
  }
  return items;
}

export function parseTokenFromUrl(req: Request, prefix: string): string | null {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const index = parts.findIndex((part) => part === prefix);
  if (index >= 0 && parts[index + 1]) return decodeURIComponent(parts[index + 1]);
  const query = url.searchParams.get("shareToken") ?? url.searchParams.get("token");
  return query;
}
