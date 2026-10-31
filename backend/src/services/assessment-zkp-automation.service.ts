/**
 * Backend-controlled assessment policy evaluation at the fixed 60% threshold.
 * Credentials remain listable regardless of MEETS / BELOW / ERROR.
 * Does not touch issuance, revocation, or Fabric.
 */
import { createHash, randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { AppError } from "../utils/AppError";
import { isMissingColumnError, isMissingRelationError } from "../utils/supabase-errors";
import { commitmentModulePath, pinnedScoreArtifactHashes, resolveZkpArtifactDir } from "./zkp-artifacts";
import { generateScoreThresholdProof } from "./score-zkp-proof.service";
import { readGroth16Proof } from "./zkp-verify";
import { loadCredentialByIdOrUri } from "./credential-verify.service";
import { recomputeStoredDocumentHash } from "./credential-verify";
import { verifyCredentialHash } from "./signing.service";
import { supabaseService } from "./supabase.service";
import {
  assertTrustedOpening,
  readAssessmentCommitment,
  type AssessmentAttemptRecord,
  type AssessmentOpeningRecord,
} from "./assessment-binding";
import {
  createSupabaseZkpPolicyStore,
  toPublicPolicyStatus,
  type ZkpPolicyStore,
  type ZkpPolicyVerificationRow,
} from "./zkp-policy-store";
import {
  ASSESSMENT_POLICY_THRESHOLD,
  ASSESSMENT_POLICY_VERSION,
  ASSESSMENT_ZKP_TYPE,
  outcomeFromComparison,
  variantForOutcome,
  type CircuitVariant,
} from "./zkp-policy";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DISCLOSURE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

let queueDepth = 0;
const MAX_QUEUE = 2;

export function resetAssessmentAutomationQueueForTests(): void {
  queueDepth = 0;
}

async function withProofCapacity<T>(work: () => Promise<T>): Promise<T> {
  if (queueDepth >= MAX_QUEUE) {
    throw new AppError("Proof generation is busy. Try again shortly.", 429);
  }
  queueDepth += 1;
  try {
    return await work();
  } finally {
    queueDepth -= 1;
  }
}

export function assessmentEvidenceRef(attemptId: string): string {
  return `attempt:${attemptId}`;
}

function mapAttempt(row: Record<string, unknown> | null): AssessmentAttemptRecord | null {
  if (!row || typeof row.id !== "string") return null;
  return {
    id: row.id,
    learnerUserId: typeof row.learner_user_id === "string" ? row.learner_user_id : "",
    skillId: typeof row.skill_id === "string" ? row.skill_id : null,
    status: typeof row.status === "string" ? row.status : "",
    passed: row.passed === true,
    percentage: typeof row.percentage === "number" || typeof row.percentage === "string" ? row.percentage : null,
    commitment: typeof row.commitment === "string" ? row.commitment : null,
    commitmentScheme: typeof row.commitment_scheme === "string" ? row.commitment_scheme : null,
    commitmentCircuitId: typeof row.commitment_circuit_id === "string" ? row.commitment_circuit_id : null,
    commitmentVersion: typeof row.commitment_version === "number" ? row.commitment_version : null,
    submittedAt: typeof row.submitted_at === "string" ? row.submitted_at : null,
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
  };
}

function mapOpening(row: Record<string, unknown> | null): AssessmentOpeningRecord | null {
  if (!row) return null;
  const score = typeof row.score === "number"
    ? row.score
    : typeof row.score === "string" && /^(0|[1-9][0-9]*)$/.test(row.score)
      ? Number(row.score)
      : null;
  if (score === null || !Number.isInteger(score)) return null;
  if (typeof row.blinding !== "string" || typeof row.learner_user_id !== "string" || typeof row.attempt_id !== "string") {
    return null;
  }
  return {
    score,
    blinding: row.blinding,
    learnerId: row.learner_user_id,
    attemptId: row.attempt_id,
  };
}

async function fieldElements(learnerId: string, attemptId: string, opening: AssessmentOpeningRecord) {
  const mod = await import(pathToFileURL(commitmentModulePath()).href) as {
    decimal: (value: bigint | number) => string;
    uuidToField: (value: string) => bigint;
  };
  return {
    score: opening.score,
    blinding: opening.blinding,
    learnerId: mod.decimal(mod.uuidToField(learnerId)),
    attemptId: mod.decimal(mod.uuidToField(attemptId)),
  };
}

/** Groth16 check against the source-pinned verification key for the variant. */
export async function verifyScorePolicyProof(
  variant: CircuitVariant,
  publicSignals: string[],
  proof: unknown,
): Promise<boolean> {
  const dir = resolveZkpArtifactDir(variant);
  if (!dir) return false;
  try {
    const { createRequire } = await import("node:module");
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const bytes = readFileSync(path.join(dir, "verification_key.json"));
    const sha = createHash("sha256").update(bytes).digest("hex");
    if (sha !== pinnedScoreArtifactHashes(variant).verificationKey) return false;
    const key = JSON.parse(bytes.toString("utf8")) as object;
    const snarkjs = createRequire(__filename)("snarkjs") as {
      groth16: { verify: (k: object, s: string[], p: unknown) => Promise<boolean> };
    };
    return (await snarkjs.groth16.verify(key, publicSignals, proof)) === true;
  } catch {
    return false;
  }
}

export interface AssessmentAutomationDependencies {
  policyStore: ZkpPolicyStore;
  generateProof: typeof generateScoreThresholdProof;
  verifyProof: (
    variant: CircuitVariant,
    publicSignals: string[],
    proof: unknown,
  ) => Promise<boolean>;
  loadCredential: typeof loadCredentialByIdOrUri;
}

function defaultDependencies(): AssessmentAutomationDependencies {
  return {
    policyStore: createSupabaseZkpPolicyStore(),
    generateProof: generateScoreThresholdProof,
    verifyProof: verifyScorePolicyProof,
    loadCredential: loadCredentialByIdOrUri,
  };
}

function isReusable(
  existing: ZkpPolicyVerificationRow,
  commitment: string,
  freshAt: string | null,
): boolean {
  if (existing.outcome !== "MEETS_THRESHOLD" && existing.outcome !== "BELOW_THRESHOLD") {
    return false;
  }
  if (!existing.proof || !existing.publicSignals) return false;
  const signals = existing.publicSignals;
  if (!Array.isArray(signals) || signals[1] !== commitment) return false;
  if (freshAt && existing.evidenceFreshAt !== freshAt) return false;
  if (existing.threshold !== ASSESSMENT_POLICY_THRESHOLD) return false;
  return true;
}

export interface AssessmentEvaluateResult {
  status: ReturnType<typeof toPublicPolicyStatus>;
  disclosureToken: string | null;
  reused: boolean;
}

export async function evaluateAssessmentPolicy(
  learnerId: string,
  credentialId: string,
  dependencies: AssessmentAutomationDependencies = defaultDependencies(),
  options: { issueDisclosure?: boolean } = {},
): Promise<AssessmentEvaluateResult> {
  const issueDisclosure = options.issueDisclosure ?? true;
  if (!UUID.test(learnerId)) throw new AppError("Authentication required", 401);
  if (!credentialId || typeof credentialId !== "string") {
    throw new AppError("credentialId is required", 400);
  }

  const availability = await dependencies.policyStore.checkAvailability();
  if (!availability.available) {
    throw new AppError(
      availability.reason === "missing_table"
        ? "ZKP policy table is not applied"
        : "Trusted ZKP policy records are unavailable",
      503,
    );
  }

  const row = await dependencies.loadCredential(credentialId);
  if (!row || row.user_id !== learnerId) {
    throw new AppError(row ? "Not authorized" : "Credential not found", row ? 403 : 404);
  }

  // Credentials remain listable; evaluation failures never revoke or hide them.
  const commitmentRead = readAssessmentCommitment(row.credential_document);
  if (commitmentRead.status !== "ok") {
    throw new AppError("Credential has no trusted assessment commitment", 409);
  }

  const recomputed = recomputeStoredDocumentHash(row.credential_document);
  const proofVal = row.proof && typeof row.proof === "object"
    ? (row.proof as { proofValue?: unknown }).proofValue
    : null;
  if (
    !recomputed
    || recomputed !== row.credential_hash
    || typeof proofVal !== "string"
    || !verifyCredentialHash(recomputed, proofVal)
  ) {
    throw new AppError("Credential document is not a valid signed credential", 409);
  }
  if (row.revoked_at) {
    throw new AppError("Revoked credentials cannot be evaluated", 409);
  }

  const attemptId = commitmentRead.claim.attemptId;
  const evidenceRef = assessmentEvidenceRef(attemptId);
  const freshAt = typeof row.updated_at === "string"
    ? row.updated_at
    : typeof row.created_at === "string"
      ? row.created_at
      : new Date().toISOString();

  const existing = await dependencies.policyStore.getByEvidence(
    learnerId,
    ASSESSMENT_ZKP_TYPE,
    ASSESSMENT_POLICY_VERSION,
    evidenceRef,
  );
  if (existing && isReusable(existing, commitmentRead.claim.commitment, freshAt)) {
    return reuseWithDisclosure(existing, dependencies.policyStore, issueDisclosure);
  }

  try {
    return await withProofCapacity(async () => {
      const attemptQuery = await supabaseService.client
        .from("mcq_task_attempts")
        .select("id, learner_user_id, skill_id, status, passed, percentage, commitment, commitment_scheme, commitment_circuit_id, commitment_version, submitted_at, created_at")
        .eq("id", attemptId)
        .eq("learner_user_id", learnerId)
        .maybeSingle();
      if (attemptQuery.error) {
        if (isMissingColumnError(attemptQuery.error) || isMissingRelationError(attemptQuery.error)) {
          throw new AppError("Trusted assessment commitments are not available", 409);
        }
        throw new AppError("Could not load assessment attempt", 500);
      }
      const attempt = mapAttempt((attemptQuery.data as Record<string, unknown> | null) ?? null);

      const openingQuery = await supabaseService.client
        .from("assessment_openings")
        .select("attempt_id, learner_user_id, score, blinding")
        .eq("attempt_id", attemptId)
        .eq("learner_user_id", learnerId)
        .maybeSingle();
      if (openingQuery.error) {
        if (isMissingColumnError(openingQuery.error) || isMissingRelationError(openingQuery.error)) {
          throw new AppError("Trusted assessment commitments are not available", 409);
        }
        throw new AppError("Could not load assessment opening", 500);
      }
      const opening = mapOpening((openingQuery.data as Record<string, unknown> | null) ?? null);

      if (!attempt || attempt.commitment !== commitmentRead.claim.commitment) {
        throw new AppError("Assessment commitment does not match the trusted opening", 409);
      }

      const checked = await assertTrustedOpening({
        learnerId,
        attempt,
        assessmentCommitment: commitmentRead.claim,
        opening,
      });
      if (!checked.ok || !opening) {
        throw new AppError("Assessment commitment does not match the trusted opening", 409);
      }

      const fields = await fieldElements(learnerId, attemptId, opening);
      const outcome = outcomeFromComparison(opening.score, ASSESSMENT_POLICY_THRESHOLD);
      const variant = variantForOutcome(outcome);

      let generated: { proof: unknown; publicSignals: string[] };
      try {
        generated = await dependencies.generateProof({
          score: fields.score,
          blinding: fields.blinding,
          learnerId: fields.learnerId,
          attemptId: fields.attemptId,
          commitment: commitmentRead.claim.commitment,
          variant,
        });
      } catch {
        throw new AppError("Proof generation failed", 500);
      }

      const parsed = readGroth16Proof(generated.proof);
      if (
        !parsed
        || generated.publicSignals[0] !== String(ASSESSMENT_POLICY_THRESHOLD)
        || generated.publicSignals[1] !== commitmentRead.claim.commitment
      ) {
        throw new AppError("Proof generation failed", 500);
      }

      const ok = await dependencies.verifyProof(variant, generated.publicSignals, parsed);
      if (!ok) throw new AppError("Proof generation failed", 500);

      const disclosure = issueDisclosure ? newDisclosure() : null;

      const stored = await dependencies.policyStore.upsert({
        learnerUserId: learnerId,
        zkpType: ASSESSMENT_ZKP_TYPE,
        policyVersion: ASSESSMENT_POLICY_VERSION,
        threshold: ASSESSMENT_POLICY_THRESHOLD,
        outcome,
        circuitVariant: variant,
        evidenceRef,
        evidenceScope: {
          credentialId: row.credential_uri,
          attemptId,
        },
        evidenceFreshAt: freshAt,
        publicSignals: generated.publicSignals,
        proof: parsed,
        disclosureTokenHash: disclosure?.tokenHash ?? existing?.disclosureTokenHash ?? null,
        disclosureExpiresAt: disclosure?.expiresAt ?? existing?.disclosureExpiresAt ?? null,
        errorCode: null,
        errorMessage: null,
      });

      return {
        status: toPublicPolicyStatus(stored),
        disclosureToken: disclosure?.token ?? null,
        reused: false,
      };
    });
  } catch (error) {
    if (error instanceof AppError && (error.statusCode === 429 || error.statusCode === 409 || error.statusCode === 403 || error.statusCode === 404 || error.statusCode === 400 || error.statusCode === 503)) {
      throw error;
    }
    const message = error instanceof Error ? error.message : "Assessment policy evaluation failed";
    const safe = /token|blinding|secret|opening|score/i.test(message)
      ? "Assessment policy evaluation failed"
      : message.slice(0, 200);
    try {
      const stored = await dependencies.policyStore.upsert({
        learnerUserId: learnerId,
        zkpType: ASSESSMENT_ZKP_TYPE,
        policyVersion: ASSESSMENT_POLICY_VERSION,
        threshold: ASSESSMENT_POLICY_THRESHOLD,
        outcome: "ERROR",
        circuitVariant: null,
        evidenceRef,
        evidenceScope: { credentialId: row.credential_uri, attemptId },
        evidenceFreshAt: null,
        publicSignals: null,
        proof: null,
        disclosureTokenHash: null,
        disclosureExpiresAt: null,
        errorCode: "evaluation_failed",
        errorMessage: safe,
      });
      return {
        status: toPublicPolicyStatus(stored),
        disclosureToken: null,
        reused: false,
      };
    } catch {
      throw new AppError(safe, 500);
    }
  }
}

export function newDisclosure(): { token: string; tokenHash: string; expiresAt: string } {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: createHash("sha256").update(token).digest("hex"),
    expiresAt: new Date(Date.now() + DISCLOSURE_TTL_MS).toISOString(),
  };
}

/**
 * Reuse a verified row. When a learner asks, a fresh share code replaces the
 * previous one; earlier codes stop working. Proof and outcome are unchanged.
 */
export async function reuseWithDisclosure(
  existing: ZkpPolicyVerificationRow,
  store: ZkpPolicyStore,
  issueDisclosure: boolean,
): Promise<{ status: ReturnType<typeof toPublicPolicyStatus>; disclosureToken: string | null; reused: true }> {
  if (!issueDisclosure) {
    return { status: toPublicPolicyStatus(existing), disclosureToken: null, reused: true };
  }
  const disclosure = newDisclosure();
  const row = await store.upsert({
    learnerUserId: existing.learnerUserId,
    zkpType: existing.zkpType,
    policyVersion: existing.policyVersion,
    threshold: existing.threshold,
    outcome: existing.outcome,
    circuitVariant: existing.circuitVariant,
    evidenceRef: existing.evidenceRef,
    evidenceScope: existing.evidenceScope,
    evidenceFreshAt: existing.evidenceFreshAt,
    publicSignals: existing.publicSignals,
    proof: existing.proof,
    disclosureTokenHash: disclosure.tokenHash,
    disclosureExpiresAt: disclosure.expiresAt,
    errorCode: null,
    errorMessage: null,
  });
  return { status: toPublicPolicyStatus(row), disclosureToken: disclosure.token, reused: true };
}

export async function retryAssessmentPolicyRow(
  policyRow: ZkpPolicyVerificationRow,
  dependencies: AssessmentAutomationDependencies = defaultDependencies(),
): Promise<AssessmentEvaluateResult | null> {
  const credentialId = typeof policyRow.evidenceScope.credentialId === "string"
    ? policyRow.evidenceScope.credentialId
    : null;
  if (!credentialId) return null;
  return evaluateAssessmentPolicy(policyRow.learnerUserId, credentialId, dependencies, { issueDisclosure: false });
}
