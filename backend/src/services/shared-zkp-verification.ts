import { readAssessmentCommitment } from "./assessment-binding";
import { loadCredentialByIdOrUri } from "./credential-verify.service";
import { recomputeStoredDocumentHash } from "./credential-verify";
import { createSupabaseGitHubZkpStore } from "./github-zkp-store";
import { verifyGitHubContributionProof } from "./github-zkp-verify.service";
import { getEvaluateLedgerService } from "./ledger.factory";
import { hashDisclosurePayload, verifySelectiveDisclosureProof } from "./proof.service";
import { DIRECT_RECRUITER_SHARE, isAllRecruiterShare, shareVisibleToRecruiter } from "./share-directory";
import { privateResultPlaceholder, type PrivateResultView } from "./share-evidence-summary";
import { listCompetencyGithubRepoFullNames } from "./share-zkp.service";
import { verifyCredentialHash } from "./signing.service";
import { supabaseService } from "./supabase.service";
import { validationReferenceFromDocument } from "./versioned-issuance";
import { createSupabaseZkpPolicyStore } from "./zkp-policy-store";
import {
  ASSESSMENT_ZKP_TYPE, GITHUB_ZKP_TYPE, MOODLE_ZKP_TYPE, PEER_REVIEW_ZKP_TYPE,
  SHARE_ASSESSMENT_POLICY_VERSION, SHARE_ASSESSMENT_THRESHOLD,
  SHARE_GITHUB_POLICY_VERSION, SHARE_GITHUB_THRESHOLD,
  SHARE_MOODLE_POLICY_VERSION, SHARE_MOODLE_THRESHOLD_PERCENT,
  SHARE_PEER_POLICY_VERSION, SHARE_PEER_REVIEW_THRESHOLD,
} from "./zkp-policy";
import { defaultVerifyGroth16, readGroth16Proof, readPinnedVerificationKey } from "./zkp-verify";

const policies = {
  practical_task_result: ["practical_assessment", SHARE_ASSESSMENT_POLICY_VERSION, ASSESSMENT_ZKP_TYPE, SHARE_ASSESSMENT_THRESHOLD],
  github_evidence: ["github_activity", SHARE_GITHUB_POLICY_VERSION, GITHUB_ZKP_TYPE, SHARE_GITHUB_THRESHOLD],
  lms_evidence: ["moodle_learning", SHARE_MOODLE_POLICY_VERSION, MOODLE_ZKP_TYPE, SHARE_MOODLE_THRESHOLD_PERCENT],
  peer_reviews: ["peer_review", SHARE_PEER_POLICY_VERSION, PEER_REVIEW_ZKP_TYPE, SHARE_PEER_REVIEW_THRESHOLD],
} as const;

type Audience = { recruiterUserId: string } | { bearerLink: true };
type Credential = NonNullable<Awaited<ReturnType<typeof loadCredentialByIdOrUri>>>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function hasValidSharedPayloadSignature(row: Record<string, unknown>): boolean {
  const { disclosed_payload, payload_hash, proof_value, created_at, verification_method, expires_at } = row;
  if (typeof row.learner_id !== "string" || typeof row.competency_id !== "string"
    || typeof payload_hash !== "string" || typeof proof_value !== "string"
    || typeof created_at !== "string" || !Number.isFinite(Date.parse(created_at))
    || (expires_at != null && (typeof expires_at !== "string" || !Number.isFinite(Date.parse(expires_at))))
    || hashDisclosurePayload(disclosed_payload) !== payload_hash) return false;
  return verifySelectiveDisclosureProof({
    learnerId: row.learner_id,
    competencyId: row.competency_id,
    learnerDid: typeof verification_method === "string" ? verification_method.split("#")[0] : null,
    createdAt: created_at,
    expiresAt: typeof expires_at === "string" ? expires_at : null,
    payloadHash: payload_hash,
    proof: { proofValue: proof_value },
  });
}

const defaultSources = {
  loadCredential: loadCredentialByIdOrUri,
  verifyIssuer: verifyCredentialHash,
  async credentialActive(credential: Credential) {
    if (credential.revoked_at || credential.revoke_status === "pending" || credential.revoke_status === "revoked") return false;
    const ledger = getEvaluateLedgerService();
    if (!ledger.isEnabled()) return true;
    const anchor = await ledger.verifyCredential(credential.id, credential.credential_hash!);
    return !anchor.exists || (anchor.hashMatches && anchor.status === "active");
  },
  async assessmentLinked(attemptId: string, learnerId: string, competencyId: string, commitment: string) {
    const { data, error } = await supabaseService.client.from("mcq_task_attempts").select("id")
      .eq("id", attemptId).eq("learner_user_id", learnerId).eq("skill_id", competencyId)
      .eq("commitment", commitment).maybeSingle();
    return !error && Boolean(data);
  },
  async githubCommitment(snapshotId: string, credential: Credential, competencyId: string) {
    const { data: skill, error } = await supabaseService.client.from("declared_skills").select("id")
      .eq("id", competencyId).eq("user_id", credential.user_id).eq("name", credential.skill_name ?? "").maybeSingle();
    if (error || !skill) return null;
    const snapshot = await createSupabaseGitHubZkpStore().getSnapshot(snapshotId, credential.user_id);
    if (!snapshot) return null;
    const repository = snapshot.repositoryFullName.toLowerCase();
    const linked = await listCompetencyGithubRepoFullNames(credential.user_id, competencyId);
    if (!linked.some((name) => name.toLowerCase() === repository)) return null;
    const validationReference = validationReferenceFromDocument(credential.credential_document);
    if (validationReference) {
      const policy = (await createSupabaseZkpPolicyStore().listForLearner(credential.user_id))
        .find((row) => row.id === validationReference && row.zkpType === GITHUB_ZKP_TYPE && row.outcome === "MEETS_THRESHOLD");
      if (policy?.evidenceScope.snapshotId !== snapshotId
        || String(policy.evidenceScope.repositoryFullName ?? "").toLowerCase() !== repository
        || !(Date.parse(snapshot.verifiedAt) <= Date.parse(credential.valid_from))) return null;
    }
    return snapshot.commitment;
  },
};

export async function verifySharedPrivateResults(
  row: Record<string, unknown>,
  audience: Audience,
  sources = defaultSources,
): Promise<Record<string, unknown>> {
  const payload = asRecord(row.disclosed_payload) ?? {};
  const { zkProofs, privateResults: _storedResults, ...safePayload } = payload;
  const modes = asRecord(payload.evidenceModes);
  if (!modes) return safePayload;

  const authorized = "recruiterUserId" in audience
    ? shareVisibleToRecruiter({
        revokedAt: typeof row.revoked_at === "string" ? row.revoked_at : null,
        expiresAt: typeof row.expires_at === "string" ? row.expires_at : null,
        disclosedPayload: payload,
        recruiterUserId: audience.recruiterUserId,
      })
    : payload.shareKind !== DIRECT_RECRUITER_SHARE && !isAllRecruiterShare(payload);
  if (!authorized || row.revoked_at || (typeof row.expires_at === "string" && Date.parse(row.expires_at) <= Date.now())
    || !hasValidSharedPayloadSignature(row)) return safePayload;

  const selectedId = asRecord(payload.selectiveDisclosure)?.credentialId;
  const proofs = Array.isArray(zkProofs) ? zkProofs : [];
  let credential: Credential | null = null;
  if (typeof selectedId === "string" && proofs.length > 0
    && (modes.practical_task_result === "private" || modes.github_evidence === "private")) {
    try {
      const candidate = await sources.loadCredential(selectedId);
      const hash = recomputeStoredDocumentHash(candidate?.credential_document);
      const issuerProof = candidate?.proof?.proofValue;
      if (candidate?.id === selectedId && candidate.user_id === row.learner_id
        && hash && hash === candidate.credential_hash
        && typeof issuerProof === "string" && sources.verifyIssuer(hash, issuerProof)
        && await sources.credentialActive(candidate)) credential = candidate;
    } catch {
      // Missing or unverifiable credentials fail closed for private results.
    }
  }

  const results: Array<PrivateResultView & { threshold: string; proofType: "Groth16" }> = [];
  for (const [field, [claimType, policyId, circuitId, threshold]] of Object.entries(policies)) {
    if (modes[field] !== "private") continue;
    const candidates = proofs.map(asRecord).filter((proof) => proof?.claimType === claimType);
    const attachment = candidates.length === 1 ? candidates[0] : null;
    let status: PrivateResultView["status"] = "unavailable";
    if ((claimType === "practical_assessment" || claimType === "github_activity")
      && credential && attachment && typeof row.competency_id === "string") {
      status = "failed";
      try {
        if (await verifyAttachment(attachment, credential, row.competency_id, claimType, policyId, circuitId, String(threshold), sources)) {
          status = "confirmed";
        }
      } catch {
        // Do not expose storage errors or evidence data to the recipient.
      }
    }
    const result = privateResultPlaceholder(claimType, status, policyId, circuitId);
    results.push({ ...result, threshold: String(threshold), proofType: "Groth16" });
  }
  return results.length ? { ...safePayload, privateResults: results } : safePayload;
}

async function verifyAttachment(
  attachment: Record<string, unknown>,
  credential: Credential,
  competencyId: string,
  claimType: "practical_assessment" | "github_activity",
  policyId: string,
  circuitId: string,
  threshold: string,
  sources: typeof defaultSources,
): Promise<boolean> {
  const credentialMatches = attachment.credentialId === credential.id
    || (claimType === "practical_assessment" && attachment.credentialId === credential.credential_uri);
  const signals = attachment.publicSignals;
  if (!credentialMatches || attachment.policyId !== policyId || attachment.circuitId !== circuitId
    || attachment.threshold !== threshold || typeof attachment.commitment !== "string"
    || !Array.isArray(signals) || signals.length !== 2 || signals[0] !== threshold
    || signals[1] !== attachment.commitment) return false;

  if (claimType === "github_activity") {
    if (typeof attachment.snapshotId !== "string") return false;
    const commitment = await sources.githubCommitment(attachment.snapshotId, credential, competencyId);
    return commitment === attachment.commitment
      && (await verifyGitHubContributionProof({ circuitId, proof: attachment.proof, publicSignals: signals }, commitment)).cryptographicallyValid;
  }

  const commitment = readAssessmentCommitment(credential.credential_document);
  const proof = readGroth16Proof(attachment.proof);
  const key = readPinnedVerificationKey();
  return Boolean(commitment.status === "ok" && commitment.claim.commitment === attachment.commitment
    && proof && key
    && await sources.assessmentLinked(commitment.claim.attemptId, credential.user_id, competencyId, commitment.claim.commitment)
    && await defaultVerifyGroth16(key.key, signals, proof));
}
