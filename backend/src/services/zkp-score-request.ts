/**
 * Recruiter-selected score-threshold-v1 requests.
 *
 * The Groth16 statement is only: the committed score is at least the public
 * threshold. Signature, holder, revocation, ledger, and single-use acceptance
 * are checked beside the proof. The v1 proof does not contain a nonce.
 */
import { createHash } from "node:crypto";
import { readGroth16Proof } from "./zkp-verify";
import { recomputeStoredDocumentHash } from "./credential-verify";
import { readAssessmentCommitment, TRUSTED_CIRCUIT_ID } from "./assessment-binding";
import { AppError } from "../utils/AppError";
import type { CredentialRow } from "../types/credentials.types";
import type { VerifyCredentialResult } from "./ledger.types";
import type { ScoreRequestRecord, ScoreRequestStore } from "./zkp-score-request.store";

export const SCORE_REQUEST_TTL_MS = 24 * 60 * 60 * 1000;
export const V1_FRESHNESS_LIMIT =
  "The Groth16 proof does not contain a one-time challenge. SIJIL accepts it once, for this learner and this request. The same proof could satisfy a new request. This is not cryptographic freshness.";

const CANONICAL_DECIMAL = /^(0|[1-9][0-9]*)$/;

export interface ScoreRequestChecks {
  mathematics: "valid" | "invalid" | "malformed" | "not_checked";
  signature: "valid" | "invalid" | "missing" | "not_checked";
  document: "matches" | "mismatch" | "not_checked";
  commitment: "matches" | "mismatch" | "missing" | "unsupported" | "not_checked";
  threshold: "matches" | "mismatch" | "not_checked";
  holder: "matches" | "mismatch" | "not_checked";
  revocation: "active" | "revoked" | "not_checked";
  ledger: "active" | "unavailable" | "missing" | "hash_mismatch" | "revoked" | "not_checked";
  request: "open" | "accepted" | "expired" | "used" | "declined" | "rejected";
}

export interface ScoreRequestDecision {
  accepted: boolean;
  threshold: number;
  credentialId: string;
  checks: ScoreRequestChecks;
  message: string;
  limitation: string;
}

export interface ScoreRequestLedger {
  isEnabled(): boolean;
  verifyCredential(credentialId: string, hashValue: string): Promise<VerifyCredentialResult>;
}

export interface ScoreRequestDependencies {
  store: ScoreRequestStore;
  now: () => number;
  loadCredential: (idOrUri: string) => Promise<CredentialRow | null>;
  verifySignature: (hashHex: string, proofValue: string) => boolean;
  verifyGroth16: (verificationKey: object, publicSignals: string[], proof: unknown) => Promise<boolean>;
  readVerificationKey: () => { key: object } | null;
  ledger: ScoreRequestLedger;
}

function blankChecks(): ScoreRequestChecks {
  return {
    mathematics: "not_checked",
    signature: "not_checked",
    document: "not_checked",
    commitment: "not_checked",
    threshold: "not_checked",
    holder: "not_checked",
    revocation: "not_checked",
    ledger: "not_checked",
    request: "rejected",
  };
}

export function hashShareToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function assertThreshold(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 100) {
    throw new AppError("Choose a whole-number minimum from 0 to 100.", 400);
  }
}

export function effectiveStatus(row: ScoreRequestRecord, now: number): ScoreRequestRecord["status"] {
  if (row.status === "open" && Date.parse(row.expiresAt) <= now) return "expired";
  return row.status;
}

function decision(
  threshold: number,
  credentialId: string,
  accepted: boolean,
  checks: ScoreRequestChecks,
  message: string,
): ScoreRequestDecision {
  return {
    accepted,
    threshold,
    credentialId,
    checks,
    message,
    limitation: V1_FRESHNESS_LIMIT,
  };
}

function readSignals(value: unknown): [string, string] | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  if (typeof value[0] !== "string" || typeof value[1] !== "string") return null;
  if (!CANONICAL_DECIMAL.test(value[0]) || !CANONICAL_DECIMAL.test(value[1])) return null;
  const threshold = Number(value[0]);
  if (!Number.isInteger(threshold) || threshold < 0 || threshold > 100) return null;
  return [value[0], value[1]];
}

function issuerProofValue(proof: unknown): string | null {
  if (!proof || typeof proof !== "object") return null;
  const value = (proof as { proofValue?: unknown }).proofValue;
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function readLedger(
  ledger: ScoreRequestLedger,
  credentialId: string,
  hash: string,
): Promise<ScoreRequestChecks["ledger"]> {
  if (!ledger.isEnabled()) return "unavailable";
  try {
    const view = await ledger.verifyCredential(credentialId, hash);
    if (!view.exists) return "missing";
    if (!view.hashMatches) return "hash_mismatch";
    if (view.status === "revoked") return "revoked";
    if (view.status === "active") return "active";
    return "unavailable";
  } catch {
    return "unavailable";
  }
}

export function publicRequest(row: ScoreRequestRecord, now: number) {
  return {
    id: row.id,
    credentialId: row.credentialUri,
    threshold: row.threshold,
    status: effectiveStatus(row, now),
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    consumedAt: row.consumedAt,
  };
}

export async function createScoreRequest(input: {
  recruiterUserId: string;
  learnerUserId: string;
  credential: CredentialRow;
  threshold: number;
  shareToken: string;
  dependencies: Pick<ScoreRequestDependencies, "store" | "now" | "verifySignature">;
}): Promise<ScoreRequestRecord> {
  assertThreshold(input.threshold);
  if (input.credential.user_id !== input.learnerUserId) {
    throw new AppError("Credential not found", 404);
  }
  if (input.credential.revoked_at) {
    throw new AppError("This credential has been revoked.", 409);
  }
  const recomputed = recomputeStoredDocumentHash(input.credential.credential_document);
  const signature = issuerProofValue(input.credential.proof);
  if (!recomputed || recomputed !== input.credential.credential_hash || !signature) {
    throw new AppError("This credential is not signed, so a score request cannot be created.", 409);
  }
  try {
    if (!input.dependencies.verifySignature(recomputed, signature)) {
      throw new AppError("This credential signature did not check out.", 409);
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError("This credential signature could not be checked.", 503);
  }
  const commitment = readAssessmentCommitment(input.credential.credential_document);
  if (commitment.status !== "ok") {
    throw new AppError("This credential has no assessment commitment to prove.", 409);
  }
  const availability = await input.dependencies.store.checkAvailability();
  if (!availability.available) {
    throw new AppError("Score verification requests are not available until the local table is applied.", 503);
  }
  const now = input.dependencies.now();
  const open = (await input.dependencies.store.listForCredential(input.credential.credential_uri))
    .filter((row) => row.recruiterUserId === input.recruiterUserId && effectiveStatus(row, now) === "open");
  if (open.length >= 5) {
    throw new AppError("Too many open requests for this credential. Wait for the learner, or let one expire.", 429);
  }
  return input.dependencies.store.insert({
    recruiterUserId: input.recruiterUserId,
    learnerUserId: input.learnerUserId,
    credentialUri: input.credential.credential_uri,
    credentialId: input.credential.id,
    threshold: input.threshold,
    audience: input.recruiterUserId,
    shareTokenHash: hashShareToken(input.shareToken),
    expiresAt: new Date(now + SCORE_REQUEST_TTL_MS).toISOString(),
  });
}

export async function evaluateScoreSubmission(input: {
  request: ScoreRequestRecord;
  learnerUserId: string;
  credential: CredentialRow | null;
  circuitId: unknown;
  proof: unknown;
  publicSignals: unknown;
  dependencies: Pick<ScoreRequestDependencies, "now" | "verifySignature" | "verifyGroth16" | "readVerificationKey" | "ledger">;
}): Promise<ScoreRequestDecision> {
  const checks = blankChecks();
  const threshold = input.request.threshold;
  const credentialId = input.request.credentialUri;
  const now = input.dependencies.now();
  const status = effectiveStatus(input.request, now);
  if (input.request.learnerUserId !== input.learnerUserId) {
    checks.request = "rejected";
    checks.holder = "mismatch";
    return decision(threshold, credentialId, false, checks, "This request belongs to another learner.");
  }
  if (status === "expired") {
    checks.request = "expired";
    return decision(threshold, credentialId, false, checks, "This request has expired. Ask the recruiter to send a new one.");
  }
  if (status === "declined") {
    checks.request = "declined";
    return decision(threshold, credentialId, false, checks, "This request was declined.");
  }
  if (status === "consumed") {
    checks.request = "used";
    return decision(threshold, credentialId, false, checks, "This request was already used.");
  }
  checks.request = "open";

  const credential = input.credential;
  if (!credential || credential.user_id !== input.request.learnerUserId || credential.credential_uri !== input.request.credentialUri) {
    checks.holder = "mismatch";
    return decision(threshold, credentialId, false, checks, "This proof is not for the credential in the request.");
  }
  checks.holder = "matches";

  const recomputed = recomputeStoredDocumentHash(credential.credential_document);
  checks.document = recomputed && recomputed === credential.credential_hash ? "matches" : "mismatch";
  const signature = issuerProofValue(credential.proof);
  if (checks.document === "matches" && recomputed && signature) {
    try {
      checks.signature = input.dependencies.verifySignature(recomputed, signature) ? "valid" : "invalid";
    } catch (err) {
      if (err instanceof AppError && err.statusCode === 503) throw err;
      checks.signature = "invalid";
    }
  } else {
    checks.signature = signature ? "invalid" : "missing";
  }
  if (checks.document !== "matches" || checks.signature !== "valid" || !recomputed) {
    return decision(threshold, credentialId, false, checks, "The issuer signature or credential document did not check out.");
  }

  if (credential.revoked_at) {
    checks.revocation = "revoked";
    return decision(threshold, credentialId, false, checks, "This credential has been revoked.");
  }
  checks.revocation = "active";

  const commitment = readAssessmentCommitment(credential.credential_document);
  if (commitment.status === "missing") {
    checks.commitment = "missing";
    return decision(threshold, credentialId, false, checks, "This credential has no assessment commitment.");
  }
  if (commitment.status === "unsupported") {
    checks.commitment = "unsupported";
    return decision(threshold, credentialId, false, checks, "This credential uses an unsupported proof type.");
  }

  if (input.circuitId !== TRUSTED_CIRCUIT_ID) {
    checks.mathematics = "malformed";
    return decision(threshold, credentialId, false, checks, "This proof uses an unsupported circuit.");
  }
  const proof = readGroth16Proof(input.proof);
  const signals = readSignals(input.publicSignals);
  if (!proof || !signals) {
    checks.mathematics = "malformed";
    return decision(threshold, credentialId, false, checks, "The proof could not be read. Nothing was accepted.");
  }
  if (signals[0] !== String(threshold)) {
    checks.threshold = "mismatch";
    checks.mathematics = "invalid";
    return decision(threshold, credentialId, false, checks, "The proof is for a different minimum than the one requested.");
  }
  checks.threshold = "matches";
  if (signals[1] !== commitment.claim.commitment) {
    checks.commitment = "mismatch";
    checks.mathematics = "invalid";
    return decision(threshold, credentialId, false, checks, "The proof does not match this credential.");
  }
  checks.commitment = "matches";

  const pinned = input.dependencies.readVerificationKey();
  if (!pinned) {
    checks.mathematics = "not_checked";
    return decision(threshold, credentialId, false, checks, "The trusted verification key is not available.");
  }
  let mathOk = false;
  try {
    mathOk = await input.dependencies.verifyGroth16(pinned.key, signals, proof);
  } catch {
    mathOk = false;
  }
  checks.mathematics = mathOk ? "valid" : "invalid";
  if (!mathOk) {
    return decision(threshold, credentialId, false, checks, "The proof did not verify. The minimum was not accepted.");
  }

  checks.ledger = await readLedger(input.dependencies.ledger, credential.id, recomputed);
  if (checks.ledger === "revoked" || checks.ledger === "hash_mismatch" || checks.ledger === "missing") {
    const message = checks.ledger === "revoked"
      ? "The blockchain record says this credential is revoked."
      : checks.ledger === "hash_mismatch"
        ? "The blockchain record does not match this credential."
        : "This credential is not on the blockchain record.";
    return decision(threshold, credentialId, false, checks, message);
  }

  const ledgerNote = checks.ledger === "active"
    ? "The blockchain record matches."
    : "The blockchain anchor was not checked, so this is not a ledger confirmation.";
  return decision(
    threshold,
    credentialId,
    true,
    checks,
    `Accepted for this request. The private score meets ${threshold}% and was not revealed. The signed credential checked out. ${ledgerNote}`,
  );
}

export async function submitScoreRequest(input: {
  requestId: string;
  learnerUserId: string;
  circuitId: unknown;
  proof: unknown;
  publicSignals: unknown;
  dependencies: ScoreRequestDependencies;
}): Promise<ScoreRequestDecision> {
  const availability = await input.dependencies.store.checkAvailability();
  if (!availability.available) {
    throw new AppError("Score verification requests are not available until the local table is applied.", 503);
  }
  const request = await input.dependencies.store.getById(input.requestId);
  if (!request || request.learnerUserId !== input.learnerUserId) {
    throw new AppError("Verification request not found", 404);
  }
  const credential = await input.dependencies.loadCredential(request.credentialUri);
  const evaluated = await evaluateScoreSubmission({
    request,
    learnerUserId: input.learnerUserId,
    credential,
    circuitId: input.circuitId,
    proof: input.proof,
    publicSignals: input.publicSignals,
    dependencies: input.dependencies,
  });
  if (!evaluated.accepted) return evaluated;

  const consumed = await input.dependencies.store.consume({
    id: request.id,
    learnerUserId: input.learnerUserId,
    now: input.dependencies.now(),
    proof: input.proof,
    publicSignals: input.publicSignals,
  });
  if (consumed !== "consumed") {
    const checks = { ...evaluated.checks, request: consumed === "expired" ? "expired" as const : "used" as const };
    return decision(
      request.threshold,
      request.credentialUri,
      false,
      checks,
      consumed === "expired"
        ? "This request expired before it could be accepted."
        : "This request was already used.",
    );
  }
  return { ...evaluated, checks: { ...evaluated.checks, request: "accepted" } };
}

export async function recheckConsumedRequest(input: {
  request: ScoreRequestRecord;
  dependencies: ScoreRequestDependencies;
}): Promise<ScoreRequestDecision> {
  const credential = await input.dependencies.loadCredential(input.request.credentialUri);
  const evaluated = await evaluateScoreSubmission({
    request: { ...input.request, status: "open", expiresAt: new Date(input.dependencies.now() + 60_000).toISOString() },
    learnerUserId: input.request.learnerUserId,
    credential,
    circuitId: TRUSTED_CIRCUIT_ID,
    proof: input.request.proof,
    publicSignals: input.request.publicSignals,
    dependencies: input.dependencies,
  });
  if (!evaluated.accepted) {
    return {
      ...evaluated,
      checks: { ...evaluated.checks, request: "used" },
      accepted: false,
      message: evaluated.checks.revocation === "revoked"
        ? "This request was used, and the credential is now revoked."
        : "This request was used, but it no longer passes the live credential checks.",
    };
  }
  return {
    ...evaluated,
    checks: { ...evaluated.checks, request: "accepted" },
  };
}
