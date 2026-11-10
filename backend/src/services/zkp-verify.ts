/**
 * Recruiter verification of a reusable score-threshold-v1 Groth16 proof.
 *
 * The v1 circuit public inputs are only [threshold, commitment]. A valid proof
 * can be submitted again. This is credential-bound verification, not a fresh
 * challenge-response. A future score-threshold-v2 would have to constrain a
 * public recruiter challenge inside the circuit. The v1 circuit is unchanged.
 *
 * locallyVerified from the learner browser is never an input to this decision.
 */
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PINNED_VERIFICATION_KEY_SHA256, resolveZkpArtifactDir } from "./zkp-artifacts";
import { AppError } from "../utils/AppError";
import { recomputeStoredDocumentHash } from "./credential-verify";
import { findCredentialForLearnerCompetency } from "./credential-verify.service";
import { getEvaluateLedgerService } from "./ledger.factory";
import { LedgerDisabledError } from "./ledger.errors";
import type { VerifyCredentialResult } from "./ledger.types";
import { verifyCredentialHash } from "./signing.service";
import { walletService } from "./wallet.service";
import { readAssessmentCommitment, TRUSTED_CIRCUIT_ID } from "./assessment-binding";

const CANONICAL_DECIMAL = /^(0|[1-9][0-9]*)$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const MAX_PROOF_JSON_CHARS = 16_384;
const REPLAY_NOTE = "score-threshold-v1 binds only the public threshold and the signed assessment commitment. It does not include a recruiter challenge, so a valid proof can be reused. A future score-threshold-v2 would constrain a public challenge inside the circuit.";

export const REUSABLE_PROOF_BINDING = "reusable-credential-bound-v1" as const;

export interface ZkpCredentialRecord {
  ledgerId: string;
  credentialUri: string;
  storedHash: string | null;
  credentialDocument: unknown;
  proofValue: string | null;
  revokedAt: string | null;
}

export interface ZkpCheckReport {
  signature: "valid" | "invalid" | "not_checked";
  documentHash: "matches" | "mismatch" | "not_checked";
  credentialRevoked: boolean | "not_checked";
  circuit: "supported" | "unsupported" | "missing" | "not_checked";
  commitment: "matches" | "mismatch" | "missing" | "unsupported" | "not_checked";
  proof: "valid" | "invalid" | "malformed" | "not_checked";
  verificationKey: "pinned" | "mismatch" | "unavailable" | "not_checked";
  fabric: "active" | "missing" | "hash_mismatch" | "revoked" | "unavailable" | "not_checked";
}

export interface ReusableScoreProofResult {
  proofBinding: typeof REUSABLE_PROOF_BINDING;
  circuitId: typeof TRUSTED_CIRCUIT_ID;
  credentialId: string;
  threshold: string | null;
  verified: boolean;
  message: string;
  replay: string;
  checks: ZkpCheckReport;
}

export type ZkpVerifyHttpResult =
  | { httpStatus: 200; result: ReusableScoreProofResult }
  | { httpStatus: 400 | 403 | 404; message: string };

interface Groth16Proof {
  protocol: "groth16";
  curve: "bn128";
  pi_a: [string, string, string];
  pi_b: [[string, string], [string, string], [string, string]];
  pi_c: [string, string, string];
}

interface LedgerReader {
  isEnabled(): boolean;
  verifyCredential(credentialId: string, hashValue: string): Promise<VerifyCredentialResult>;
}

export interface ReusableScoreProofInput {
  authorized: boolean;
  credential: ZkpCredentialRecord | null;
  submission: {
    circuitId?: unknown;
    proof?: unknown;
    publicSignals?: unknown;
  };
  verifySignature: (hashHex: string, proofValue: string) => boolean;
  ledger: LedgerReader;
  verificationKey: object | null;
  verificationKeySha256: string | null;
  pinnedVerificationKeySha256: string | null;
  verifyGroth16?: (verificationKey: object, publicSignals: string[], proof: Groth16Proof) => Promise<boolean>;
}

function blankChecks(): ZkpCheckReport {
  return {
    signature: "not_checked",
    documentHash: "not_checked",
    credentialRevoked: "not_checked",
    circuit: "not_checked",
    commitment: "not_checked",
    proof: "not_checked",
    verificationKey: "not_checked",
    fabric: "not_checked",
  };
}

function result(
  credentialId: string,
  threshold: string | null,
  verified: boolean,
  message: string,
  checks: ZkpCheckReport,
): ReusableScoreProofResult {
  return {
    proofBinding: REUSABLE_PROOF_BINDING,
    circuitId: TRUSTED_CIRCUIT_ID,
    credentialId,
    threshold,
    verified,
    message,
    replay: REPLAY_NOTE,
    checks,
  };
}

function isDecimal(value: unknown): value is string {
  return typeof value === "string" && value.length <= 80 && CANONICAL_DECIMAL.test(value);
}

function isG1(value: unknown): value is [string, string, string] {
  return Array.isArray(value) && value.length === 3 && value.every(isDecimal);
}

function isG2(value: unknown): value is [[string, string], [string, string], [string, string]] {
  return Array.isArray(value)
    && value.length === 3
    && value.every((point) => Array.isArray(point) && point.length === 2 && point.every(isDecimal));
}

export function readGroth16Proof(value: unknown): Groth16Proof | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const json = JSON.stringify(value);
  if (json.length > MAX_PROOF_JSON_CHARS) return null;
  const proof = value as Record<string, unknown>;
  if (proof.protocol !== "groth16" || proof.curve !== "bn128") return null;
  if (!isG1(proof.pi_a) || !isG2(proof.pi_b) || !isG1(proof.pi_c)) return null;
  return {
    protocol: "groth16",
    curve: "bn128",
    pi_a: proof.pi_a,
    pi_b: proof.pi_b,
    pi_c: proof.pi_c,
  };
}

function readSignals(value: unknown): [string, string] | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  if (!isDecimal(value[0]) || !isDecimal(value[1])) return null;
  const threshold = Number(value[0]);
  if (!Number.isInteger(threshold) || threshold < 0 || threshold > 100) return null;
  return [value[0], value[1]];
}

async function defaultVerifyGroth16(
  verificationKey: object,
  publicSignals: string[],
  proof: Groth16Proof,
): Promise<boolean> {
  const snarkjs = loadSnarkjs();
  if (!snarkjs) return false;
  try {
    return await snarkjs.groth16.verify(verificationKey, publicSignals, proof) === true;
  } catch {
    return false;
  }
}

function loadSnarkjs(): {
  groth16: {
    verify: (verificationKey: object, publicSignals: string[], proof: Groth16Proof) => Promise<boolean>;
  };
} | null {
  try {
    const loaded = createRequire(__filename)("snarkjs") as {
      groth16?: {
        verify: (verificationKey: object, publicSignals: string[], proof: Groth16Proof) => Promise<boolean>;
      };
    };
    if (!loaded.groth16?.verify) return null;
    return { groth16: loaded.groth16 };
  } catch {
    return null;
  }
}

export function readPinnedVerificationKey(buildDir = resolveZkpArtifactDir() ?? ""): { key: object; sha256: string; pinnedSha256: string } | null {
  if (!buildDir) return null;
  try {
    const keyPath = path.join(buildDir, "verification_key.json");
    const hashPath = path.join(buildDir, "hashes.json");
    const bytes = readFileSync(keyPath);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const hashes = JSON.parse(readFileSync(hashPath, "utf8")) as { verificationKey?: unknown };
    const manifestSha256 = typeof hashes.verificationKey === "string" ? hashes.verificationKey : "";
    if (sha256 !== PINNED_VERIFICATION_KEY_SHA256 || manifestSha256 !== PINNED_VERIFICATION_KEY_SHA256) {
      return null;
    }
    return {
      key: JSON.parse(bytes.toString("utf8")) as object,
      sha256,
      pinnedSha256: PINNED_VERIFICATION_KEY_SHA256,
    };
  } catch {
    return null;
  }
}

async function readFabric(
  ledger: LedgerReader,
  credentialId: string,
  hash: string,
): Promise<ZkpCheckReport["fabric"]> {
  if (!ledger.isEnabled()) return "unavailable";
  try {
    const view = await ledger.verifyCredential(credentialId, hash);
    if (!view.exists) return "missing";
    if (!view.hashMatches) return "hash_mismatch";
    if (view.status === "revoked") return "revoked";
    if (view.status === "active") return "active";
    return "unavailable";
  } catch (err) {
    if (err instanceof LedgerDisabledError) return "unavailable";
    return "unavailable";
  }
}

export async function evaluateReusableScoreProof(input: ReusableScoreProofInput): Promise<ZkpVerifyHttpResult> {
  if (!input.authorized || !input.credential) {
    return {
      httpStatus: input.credential ? 403 : input.authorized ? 404 : 403,
      message: input.authorized ? "Credential not found" : "Not authorized to verify this credential",
    };
  }

  const checks = blankChecks();
  const credentialId = input.credential.credentialUri;
  const fail = (message: string): ZkpVerifyHttpResult => ({
    httpStatus: 200,
    result: result(credentialId, null, false, message, checks),
  });

  const recomputed = recomputeStoredDocumentHash(input.credential.credentialDocument);
  checks.documentHash = recomputed && recomputed === input.credential.storedHash ? "matches" : "mismatch";
  if (checks.documentHash !== "matches" || !recomputed) {
    return fail("Verification failed: The credential document does not match its signed hash.");
  }

  let signatureOk = false;
  if (input.credential.proofValue) {
    try {
      signatureOk = input.verifySignature(recomputed, input.credential.proofValue);
    } catch {
      signatureOk = false;
    }
  }
  checks.signature = signatureOk ? "valid" : "invalid";
  if (!signatureOk) {
    return fail("Verification failed: The issuer signature is not valid.");
  }

  checks.credentialRevoked = Boolean(input.credential.revokedAt);
  if (input.credential.revokedAt) {
    return fail("Verification failed: This credential has been revoked.");
  }

  const commitment = readAssessmentCommitment(input.credential.credentialDocument);
  if (commitment.status === "missing") {
    checks.commitment = "missing";
    checks.circuit = "missing";
    return fail("Verification failed: This credential has no assessment commitment.");
  }
  if (commitment.status === "unsupported") {
    checks.commitment = "unsupported";
    checks.circuit = "unsupported";
    return fail("Verification failed: This proof uses an unsupported circuit.");
  }

  const circuitId = input.submission.circuitId;
  if (typeof circuitId !== "string" || circuitId.length === 0) {
    checks.circuit = "missing";
    return fail("Verification failed: This proof uses an unsupported circuit.");
  }
  if (circuitId !== TRUSTED_CIRCUIT_ID) {
    checks.circuit = "unsupported";
    return fail("Verification failed: This proof uses an unsupported circuit.");
  }
  checks.circuit = "supported";

  const proof = readGroth16Proof(input.submission.proof);
  const signals = readSignals(input.submission.publicSignals);
  if (!proof || !signals) {
    checks.proof = "malformed";
    return {
      httpStatus: 400,
      message: "Verification failed: The proof is malformed or too large.",
    };
  }

  if (signals[1] !== commitment.claim.commitment) {
    checks.commitment = "mismatch";
    checks.proof = "invalid";
    return {
      httpStatus: 200,
      result: result(
        credentialId,
        signals[0],
        false,
        "Verification failed: The proof does not match the signed credential.",
        checks,
      ),
    };
  }
  checks.commitment = "matches";

  if (
    !input.verificationKey
    || !input.verificationKeySha256
    || !input.pinnedVerificationKeySha256
    || !SHA256_HEX.test(input.verificationKeySha256)
    || input.verificationKeySha256 !== input.pinnedVerificationKeySha256
  ) {
    checks.verificationKey = input.verificationKey ? "mismatch" : "unavailable";
    return {
      httpStatus: 200,
      result: result(
        credentialId,
        signals[0],
        false,
        "Verification failed: The verification key does not match the trusted setup.",
        checks,
      ),
    };
  }
  checks.verificationKey = "pinned";

  const verifyGroth16 = input.verifyGroth16 ?? defaultVerifyGroth16;
  const proofOk = await verifyGroth16(input.verificationKey, signals, proof);
  checks.proof = proofOk ? "valid" : "invalid";
  if (!proofOk) {
    return {
      httpStatus: 200,
      result: result(
        credentialId,
        signals[0],
        false,
        "Verification failed: The proof does not match the signed credential.",
        checks,
      ),
    };
  }

  checks.fabric = await readFabric(input.ledger, input.credential.ledgerId, recomputed);
  if (checks.fabric !== "active") {
    const fabricMessage = checks.fabric === "missing"
      ? "Verification failed: This credential is not anchored."
      : checks.fabric === "hash_mismatch"
        ? "Verification failed: The ledger anchor does not match the signed credential."
        : checks.fabric === "revoked"
          ? "Verification failed: This credential is revoked on the ledger."
          : "Verification failed: The ledger anchor could not be checked.";
    return {
      httpStatus: 200,
      result: result(credentialId, signals[0], false, fabricMessage, checks),
    };
  }

  return {
    httpStatus: 200,
    result: result(
      credentialId,
      signals[0],
      true,
      "Verified: This learner meets the required assessment threshold.",
      checks,
    ),
  };
}

export async function verifySharedScoreProof(token: string, body: unknown): Promise<ZkpVerifyHttpResult> {
  let share: { learnerId: string; competencyId: string };
  try {
    share = await walletService.resolveShareForZkp(token);
  } catch (err) {
    if (err instanceof AppError && (err.statusCode === 403 || err.statusCode === 404)) {
      return { httpStatus: err.statusCode, message: err.message };
    }
    throw err;
  }

  const row = await findCredentialForLearnerCompetency(share.learnerId, share.competencyId);
  if (!row) return { httpStatus: 404, message: "Credential not found" };

  const pinned = readPinnedVerificationKey();
  const submission = body && typeof body === "object" ? body as Record<string, unknown> : {};
  return evaluateReusableScoreProof({
    authorized: true,
    credential: {
      ledgerId: row.id,
      credentialUri: row.credential_uri,
      storedHash: row.credential_hash ?? null,
      credentialDocument: row.credential_document ?? null,
      proofValue: proofValue(row.proof),
      revokedAt: row.revoked_at ?? null,
    },
    submission: {
      circuitId: submission.circuitId,
      proof: submission.proof,
      publicSignals: submission.publicSignals,
    },
    verifySignature: verifyCredentialHash,
    ledger: getEvaluateLedgerService(),
    verificationKey: pinned?.key ?? null,
    verificationKeySha256: pinned?.sha256 ?? null,
    pinnedVerificationKeySha256: pinned?.pinnedSha256 ?? null,
  });
}

function proofValue(proof: unknown): string | null {
  if (!proof || typeof proof !== "object") return null;
  const value = (proof as { proofValue?: unknown }).proofValue;
  return typeof value === "string" && value.length > 0 ? value : null;
}
