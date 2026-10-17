/**
 * Chooses the trusted assessment attempt that a new credential may commit to.
 * The commitment is taken from the stored attempt, never from the issuance request.
 */
import { pathToFileURL } from "node:url";
import path from "node:path";
import { WALLET_READY_PASS_PERCENT } from "../utils/wallet-ready-promotion";

export const TRUSTED_COMMITMENT_SCHEME = "poseidon-bn254-v1";
export const TRUSTED_CIRCUIT_ID = "score-threshold-v1";
export const TRUSTED_COMMITMENT_VERSION = 1;

const CANONICAL_DECIMAL = /^(0|[1-9][0-9]*)$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AssessmentAttemptRecord {
  id: string;
  learnerUserId: string;
  skillId: string | null;
  status: string;
  passed: boolean;
  percentage: number | string | null;
  commitment: string | null;
  commitmentScheme: string | null;
  commitmentCircuitId: string | null;
  commitmentVersion: number | null;
  submittedAt: string | null;
  createdAt: string | null;
}

export interface AssessmentCommitmentClaim {
  version: typeof TRUSTED_COMMITMENT_VERSION;
  scheme: typeof TRUSTED_COMMITMENT_SCHEME;
  circuitId: typeof TRUSTED_CIRCUIT_ID;
  attemptId: string;
  commitment: string;
}

export type AssessmentCommitmentRead =
  | { status: "missing" }
  | { status: "unsupported" }
  | { status: "ok"; claim: AssessmentCommitmentClaim };

export function readAssessmentCommitment(document: unknown): AssessmentCommitmentRead {
  if (!document || typeof document !== "object") return { status: "missing" };
  const subject = (document as { credentialSubject?: unknown }).credentialSubject;
  if (!subject || typeof subject !== "object") return { status: "missing" };
  if (!("assessmentCommitment" in subject)) return { status: "missing" };
  const claim = (subject as { assessmentCommitment?: unknown }).assessmentCommitment;
  if (!claim || typeof claim !== "object" || Array.isArray(claim)) return { status: "unsupported" };
  const row = claim as Record<string, unknown>;
  if ("score" in row || "blinding" in row || "answerKey" in row || "learnerAnswers" in row) {
    return { status: "unsupported" };
  }
  const attemptId = row.attemptId;
  const commitment = row.commitment;
  if (
    row.version === TRUSTED_COMMITMENT_VERSION
    && row.scheme === TRUSTED_COMMITMENT_SCHEME
    && row.circuitId === TRUSTED_CIRCUIT_ID
    && typeof attemptId === "string"
    && UUID_PATTERN.test(attemptId)
    && typeof commitment === "string"
    && CANONICAL_DECIMAL.test(commitment)
  ) {
    return {
      status: "ok",
      claim: {
        version: TRUSTED_COMMITMENT_VERSION,
        scheme: TRUSTED_COMMITMENT_SCHEME,
        circuitId: TRUSTED_CIRCUIT_ID,
        attemptId,
        commitment,
      },
    };
  }
  return { status: "unsupported" };
}

export interface AssessmentOpeningRecord {
  score: number;
  blinding: string;
  learnerId: string;
  attemptId: string;
}

export type AssessmentBindingResult =
  | { ok: true; attempt: AssessmentAttemptRecord; assessmentCommitment: AssessmentCommitmentClaim }
  | { ok: false; status: 403 | 409; message: string };

function integerPercent(value: number | string | null): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && CANONICAL_DECIMAL.test(value)) {
    const parsed = Number(value);
    if (Number.isInteger(parsed)) return parsed;
  }
  return null;
}

function hasTrustedMetadata(attempt: AssessmentAttemptRecord): boolean {
  return UUID_PATTERN.test(attempt.id)
    && typeof attempt.commitment === "string"
    && CANONICAL_DECIMAL.test(attempt.commitment)
    && attempt.commitmentScheme === TRUSTED_COMMITMENT_SCHEME
    && attempt.commitmentCircuitId === TRUSTED_CIRCUIT_ID
    && attempt.commitmentVersion === TRUSTED_COMMITMENT_VERSION;
}

function timestamp(value: string | null): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function claimFor(attempt: AssessmentAttemptRecord): AssessmentCommitmentClaim {
  return {
    version: TRUSTED_COMMITMENT_VERSION,
    scheme: TRUSTED_COMMITMENT_SCHEME,
    circuitId: TRUSTED_CIRCUIT_ID,
    attemptId: attempt.id,
    commitment: String(attempt.commitment),
  };
}

/**
 * Latest submitted attempt wins. Ties break on created_at, then attempt id.
 * Only a completed, passed attempt at or above the wallet-ready percentage,
 * with Phase 2 commitment metadata, is eligible.
 */
export function selectTrustedAssessmentAttempt(input: {
  learnerId: string;
  skillId: string;
  attempts: AssessmentAttemptRecord[];
}): AssessmentBindingResult {
  const ownedSkill = input.attempts.filter(
    (attempt) => attempt.learnerUserId === input.learnerId && attempt.skillId === input.skillId,
  );

  if (ownedSkill.length === 0) {
    if (input.attempts.some((attempt) => attempt.skillId === input.skillId && attempt.learnerUserId !== input.learnerId)) {
      return {
        ok: false,
        status: 403,
        message: "Assessment attempt does not belong to the authenticated learner",
      };
    }
    if (input.attempts.some((attempt) => attempt.learnerUserId === input.learnerId && attempt.skillId !== input.skillId)) {
      return {
        ok: false,
        status: 409,
        message: "Assessment attempt does not belong to this skill",
      };
    }
    return {
      ok: false,
      status: 409,
      message: "No qualifying assessment attempt is available for this skill",
    };
  }

  const completed = ownedSkill.filter((attempt) => attempt.status === "completed");
  if (completed.length === 0) {
    return {
      ok: false,
      status: 409,
      message: "Assessment attempt is not complete",
    };
  }

  const passed = completed.filter((attempt) => {
    const percentage = integerPercent(attempt.percentage);
    return attempt.passed === true
      && percentage !== null
      && percentage >= WALLET_READY_PASS_PERCENT
      && percentage <= 100;
  });
  if (passed.length === 0) {
    return {
      ok: false,
      status: 409,
      message: "Assessment attempt does not meet the pass requirement",
    };
  }

  const trusted = passed.filter(hasTrustedMetadata);
  if (trusted.length === 0) {
    return {
      ok: false,
      status: 409,
      message: "Assessment attempt has no trusted commitment",
    };
  }

  trusted.sort((left, right) => {
    const submitted = timestamp(right.submittedAt) - timestamp(left.submittedAt);
    if (submitted !== 0) return submitted;
    const created = timestamp(right.createdAt) - timestamp(left.createdAt);
    if (created !== 0) return created;
    return right.id.localeCompare(left.id);
  });

  const attempt = trusted[0];
  return { ok: true, attempt, assessmentCommitment: claimFor(attempt) };
}

type OpeningVerifier = (input: {
  score: number;
  learnerId: string;
  attemptId: string;
  blinding: string;
  commitment: string;
}) => Promise<boolean>;

let verifierPromise: Promise<OpeningVerifier> | undefined;

async function openingVerifier(): Promise<OpeningVerifier> {
  verifierPromise ??= import(
    pathToFileURL(
      path.resolve(__dirname, "../../../circuits/score-threshold-v1/src/commitment.mjs"),
    ).href
  ).then((mod: { verifyAssessmentOpening: OpeningVerifier }) => mod.verifyAssessmentOpening);
  return verifierPromise;
}

export async function assertTrustedOpening(input: {
  learnerId: string;
  attempt: AssessmentAttemptRecord;
  assessmentCommitment: AssessmentCommitmentClaim;
  opening: AssessmentOpeningRecord | null;
}): Promise<{ ok: true } | { ok: false; status: 409; message: string }> {
  const percentage = integerPercent(input.attempt.percentage);
  if (
    !input.opening
    || input.opening.learnerId !== input.learnerId
    || input.opening.learnerId !== input.attempt.learnerUserId
    || input.opening.attemptId !== input.attempt.id
    || input.opening.attemptId !== input.assessmentCommitment.attemptId
    || percentage === null
    || input.opening.score !== percentage
    || input.assessmentCommitment.commitment !== input.attempt.commitment
  ) {
    return {
      ok: false,
      status: 409,
      message: "Assessment commitment does not match the trusted opening",
    };
  }

  const matches = await (await openingVerifier())({
    score: input.opening.score,
    learnerId: input.opening.learnerId,
    attemptId: input.opening.attemptId,
    blinding: input.opening.blinding,
    commitment: input.assessmentCommitment.commitment,
  });
  if (!matches) {
    return {
      ok: false,
      status: 409,
      message: "Assessment commitment does not match the trusted opening",
    };
  }
  return { ok: true };
}
