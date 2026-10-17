/**
 * Owner-only witness for browser Groth16 proving.
 * The caller id comes from the authenticated session, never from the request body.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PINNED_VERIFICATION_KEY_SHA256, commitmentModulePath, resolveZkpArtifactDir } from "./zkp-artifacts";
import { AppError } from "../utils/AppError";
import { recomputeStoredDocumentHash } from "./credential-verify";
import { loadCredentialByIdOrUri } from "./credential-verify.service";
import { verifyCredentialHash } from "./signing.service";
import { supabaseService } from "./supabase.service";
import { isMissingColumnError, isMissingRelationError } from "../utils/supabase-errors";
import {
  assertTrustedOpening,
  readAssessmentCommitment,
  TRUSTED_CIRCUIT_ID,
  type AssessmentAttemptRecord,
  type AssessmentOpeningRecord,
} from "./assessment-binding";
import { ROLES } from "../constants/roles";

const SHA256_HEX = /^[0-9a-f]{64}$/;

export interface WitnessCredential {
  userId: string;
  credentialUri: string;
  credentialHash: string | null;
  credentialDocument: unknown;
  proofValue: string | null;
  revokedAt: string | null;
}

export interface ArtifactHashes {
  wasm: string;
  zkey: string;
  verificationKey: string;
}

export interface OwnerWitness {
  circuitId: typeof TRUSTED_CIRCUIT_ID;
  credentialId: string;
  commitment: string;
  witness: {
    score: string;
    blinding: string;
    learnerId: string;
    attemptId: string;
  };
  artifactHashes: ArtifactHashes;
}

export type WitnessDecision =
  | { ok: true; witness: OwnerWitness }
  | { ok: false; status: 403 | 404 | 409 | 503; message: string };

function hashesLookPinned(hashes: ArtifactHashes | null): hashes is ArtifactHashes {
  return Boolean(
    hashes
    && SHA256_HEX.test(hashes.wasm)
    && SHA256_HEX.test(hashes.zkey)
    && SHA256_HEX.test(hashes.verificationKey),
  );
}

export function readPinnedArtifactHashes(
  filePath = resolveZkpArtifactDir()
    ? path.join(resolveZkpArtifactDir() as string, "hashes.json")
    : "",
): ArtifactHashes | null {
  if (!filePath) return null;
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as {
      wasm?: unknown;
      zkey?: unknown;
      verificationKey?: unknown;
    };
    const hashes = {
      wasm: typeof parsed.wasm === "string" ? parsed.wasm : "",
      zkey: typeof parsed.zkey === "string" ? parsed.zkey : "",
      verificationKey: typeof parsed.verificationKey === "string" ? parsed.verificationKey : "",
    };
    if (hashes.verificationKey !== PINNED_VERIFICATION_KEY_SHA256) return null;
    return hashesLookPinned(hashes) ? hashes : null;
  } catch {
    return null;
  }
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

export async function evaluateOwnerWitness(input: {
  callerUserId: string;
  callerRoles: readonly string[];
  credential: WitnessCredential | null;
  attempt: AssessmentAttemptRecord | null;
  opening: AssessmentOpeningRecord | null;
  artifactHashes: ArtifactHashes | null;
  verifySignature: (hashHex: string, proofValue: string) => boolean;
}): Promise<WitnessDecision> {
  if (!input.callerRoles.includes(ROLES.LEARNER) || !input.credential || input.credential.userId !== input.callerUserId) {
    return { ok: false, status: input.credential ? 403 : 404, message: input.credential ? "Not authorized to access this witness" : "Credential not found" };
  }

  const recomputed = recomputeStoredDocumentHash(input.credential.credentialDocument);
  let signatureOk = false;
  if (recomputed && input.credential.credentialHash === recomputed && input.credential.proofValue) {
    try {
      signatureOk = input.verifySignature(recomputed, input.credential.proofValue);
    } catch {
      signatureOk = false;
    }
  }
  if (!signatureOk) {
    return { ok: false, status: 409, message: "Credential document is not a valid signed credential" };
  }

  if (input.credential.revokedAt) {
    return { ok: false, status: 409, message: "Revoked credentials cannot be used to generate a proof" };
  }

  const commitment = readAssessmentCommitment(input.credential.credentialDocument);
  if (commitment.status === "missing") {
    return { ok: false, status: 409, message: "Credential has no trusted assessment commitment" };
  }
  if (commitment.status === "unsupported") {
    return { ok: false, status: 409, message: "Credential uses an unsupported assessment circuit" };
  }

  if (!hashesLookPinned(input.artifactHashes)) {
    return { ok: false, status: 503, message: "Zero-knowledge artifacts are not pinned to a trusted setup" };
  }

  if (
    !input.attempt
    || input.attempt.id !== commitment.claim.attemptId
    || input.attempt.learnerUserId !== input.callerUserId
    || input.attempt.commitment !== commitment.claim.commitment
    || input.attempt.commitmentScheme !== commitment.claim.scheme
    || input.attempt.commitmentCircuitId !== commitment.claim.circuitId
    || input.attempt.commitmentVersion !== commitment.claim.version
    || input.attempt.status !== "completed"
  ) {
    return { ok: false, status: 409, message: "Assessment commitment does not match the trusted opening" };
  }

  const checked = await assertTrustedOpening({
    learnerId: input.callerUserId,
    attempt: input.attempt,
    assessmentCommitment: commitment.claim,
    opening: input.opening,
  });
  if (!checked.ok || !input.opening) {
    return { ok: false, status: 409, message: "Assessment commitment does not match the trusted opening" };
  }

  const fields = await witnessFields(input.callerUserId, commitment.claim.attemptId, input.opening);
  return {
    ok: true,
    witness: {
      circuitId: TRUSTED_CIRCUIT_ID,
      credentialId: input.credential.credentialUri,
      commitment: commitment.claim.commitment,
      witness: fields,
      artifactHashes: input.artifactHashes,
    },
  };
}

async function witnessFields(
  learnerId: string,
  attemptId: string,
  opening: AssessmentOpeningRecord,
): Promise<OwnerWitness["witness"]> {
  const mod = await import(
    pathToFileURL(commitmentModulePath()).href
  ) as {
    decimal: (value: bigint | number) => string;
    uuidToField: (value: string) => bigint;
  };
  return {
    score: mod.decimal(opening.score),
    blinding: opening.blinding,
    learnerId: mod.decimal(mod.uuidToField(learnerId)),
    attemptId: mod.decimal(mod.uuidToField(attemptId)),
  };
}

export async function getOwnerWitness(input: {
  callerUserId: string;
  callerRoles: readonly string[];
  credentialId: string;
}): Promise<OwnerWitness> {
  const row = await loadCredentialByIdOrUri(input.credentialId);
  if (!row || row.user_id !== input.callerUserId || !input.callerRoles.includes(ROLES.LEARNER)) {
    throw new AppError(row ? "Not authorized to access this witness" : "Credential not found", row ? 403 : 404);
  }

  const commitment = readAssessmentCommitment(row.credential_document);
  let attempt: AssessmentAttemptRecord | null = null;
  let opening: AssessmentOpeningRecord | null = null;
  if (commitment.status === "ok") {
    const attemptQuery = await supabaseService.client
      .from("mcq_task_attempts")
      .select("id, learner_user_id, skill_id, status, passed, percentage, commitment, commitment_scheme, commitment_circuit_id, commitment_version")
      .eq("id", commitment.claim.attemptId)
      .eq("learner_user_id", input.callerUserId)
      .maybeSingle();
    if (attemptQuery.error) {
      if (isMissingColumnError(attemptQuery.error) || isMissingRelationError(attemptQuery.error)) {
        throw new AppError("Trusted assessment commitments are not available", 409);
      }
      throw new AppError(attemptQuery.error.message, 500);
    }
    attempt = mapAttempt((attemptQuery.data as Record<string, unknown> | null) ?? null);

    const openingQuery = await supabaseService.client
      .from("assessment_openings")
      .select("attempt_id, learner_user_id, score, blinding")
      .eq("attempt_id", commitment.claim.attemptId)
      .eq("learner_user_id", input.callerUserId)
      .maybeSingle();
    if (openingQuery.error) {
      if (isMissingColumnError(openingQuery.error) || isMissingRelationError(openingQuery.error)) {
        throw new AppError("Trusted assessment commitments are not available", 409);
      }
      throw new AppError(openingQuery.error.message, 500);
    }
    opening = mapOpening((openingQuery.data as Record<string, unknown> | null) ?? null);
  }

  const decision = await evaluateOwnerWitness({
    callerUserId: input.callerUserId,
    callerRoles: input.callerRoles,
    credential: {
      userId: row.user_id,
      credentialUri: row.credential_uri,
      credentialHash: row.credential_hash ?? null,
      credentialDocument: row.credential_document ?? null,
      proofValue: proofValue(row.proof),
      revokedAt: row.revoked_at ?? null,
    },
    attempt,
    opening,
    artifactHashes: readPinnedArtifactHashes(),
    verifySignature: verifyCredentialHash,
  });
  if (!decision.ok) throw new AppError(decision.message, decision.status);
  return decision.witness;
}

function proofValue(proof: unknown): string | null {
  if (!proof || typeof proof !== "object") return null;
  const value = (proof as { proofValue?: unknown }).proofValue;
  return typeof value === "string" && value.length > 0 ? value : null;
}
