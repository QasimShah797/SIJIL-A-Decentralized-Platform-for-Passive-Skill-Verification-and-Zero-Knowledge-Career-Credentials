/**
 * Poseidon commitment helper for score-threshold-v1.
 *
 * Uses circomlibjs, whose Poseidon parameters match circomlib 2.0.5's
 * Poseidon(n) circuit on BN254. The test suite checks that a real Groth16
 * public commitment equals this helper.
 *
 * Field: BN254 scalar field
 *   p = 21888242871839275222246405745257275088548364400416034343698204186575808495617
 *
 * Domain: big-endian integer of the UTF-8 bytes of "SIJIL-ASSESS-v1".
 * UUID: strip hyphens and parse the 32 hex characters as a big-endian integer.
 *       A UUID is 128 bits, which is less than p, so the encoding is unique.
 * Blinding: 31 cryptographically random bytes, big-endian. 2^248 < p, so the
 *           value is a field element with no modular reduction bias.
 * Integers: score and threshold are canonical decimal field elements.
 */
import { buildPoseidon } from "circomlibjs";

export const DOMAIN_LABEL = "SIJIL-ASSESS-v1";
export const BN254_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
export const DOMAIN_FIELD = 432447140727981111453175978658723377n;

const textEncoder = new TextEncoder();

let poseidonPromise;

function poseidon() {
  poseidonPromise ??= buildPoseidon();
  return poseidonPromise;
}

export function assertFieldElement(name, value) {
  if (typeof value !== "bigint" || value < 0n || value >= BN254_FIELD) {
    throw new Error(`${name} is not a BN254 field element`);
  }
}

export function utf8BeToField(label) {
  const bytes = textEncoder.encode(label);
  if (bytes.length === 0 || bytes.length > 31) {
    throw new Error("label does not fit in one BN254 field element");
  }
  let value = 0n;
  for (const byte of bytes) {
    value = (value << 8n) + BigInt(byte);
  }
  assertFieldElement("label", value);
  return value;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CANONICAL_DECIMAL = /^(0|[1-9][0-9]*)$/;

export const COMMITMENT_SCHEME = "poseidon-bn254-v1";
export const CIRCUIT_ID = "score-threshold-v1";

export function uuidToField(uuid) {
  const text = String(uuid).trim();
  if (!UUID_PATTERN.test(text)) {
    throw new Error("UUID must be 8-4-4-4-12 hexadecimal characters");
  }
  const value = BigInt(`0x${text.replaceAll("-", "").toLowerCase()}`);
  assertFieldElement("uuid", value);
  return value;
}

/** 31 cryptographically random bytes, big-endian. Always below the BN254 prime. */
export function generateSecureBlinding() {
  const bytes = new Uint8Array(31);
  crypto.getRandomValues(bytes);
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  const value = BigInt(`0x${hex}`);
  assertFieldElement("blinding", value);
  return value;
}

export function randomBlinding() {
  return generateSecureBlinding();
}

export function assertAssessmentScore(score) {
  if (typeof score !== "number" || !Number.isInteger(score) || score < 0 || score > 100) {
    throw new Error("score must be an integer from 0 to 100");
  }
}

export async function commitmentPreimage(input) {
  const domain = utf8BeToField(DOMAIN_LABEL);
  if (domain !== DOMAIN_FIELD) {
    throw new Error("domain constant drifted from the circuit literal");
  }
  const score = BigInt(input.score);
  const blinding = BigInt(input.blinding);
  const learnerId = typeof input.learnerId === "bigint" ? input.learnerId : uuidToField(input.learnerId);
  const attemptId = typeof input.attemptId === "bigint" ? input.attemptId : uuidToField(input.attemptId);
  assertFieldElement("score", score);
  assertFieldElement("blinding", blinding);
  return [domain, score, blinding, learnerId, attemptId];
}

export async function poseidonCommitment(input) {
  const hash = await poseidon();
  const preimage = await commitmentPreimage(input);
  const digest = hash(preimage);
  return BigInt(hash.F.toString(digest));
}

export function decimal(value) {
  return BigInt(value).toString(10);
}

function parseCanonicalDecimal(name, value) {
  if (typeof value === "bigint") {
    assertFieldElement(name, value);
    return value;
  }
  if (typeof value !== "string" || !CANONICAL_DECIMAL.test(value)) {
    throw new Error(`${name} must be a canonical decimal field element`);
  }
  const parsed = BigInt(value);
  assertFieldElement(name, parsed);
  return parsed;
}

function publicCommitmentValue(commitment) {
  if (commitment && typeof commitment === "object" && "commitment" in commitment) {
    return commitment.commitment;
  }
  return commitment;
}

/**
 * Build the issuer-side commitment for one completed assessment.
 * `publicCommitment` is safe to put in a signed credential.
 * `opening` is private and must not be logged or returned to a recruiter.
 * Pass `blinding` only when reproducing an existing opening.
 */
export async function createAssessmentCommitment(input) {
  assertAssessmentScore(input.score);
  const learnerId = String(input.learnerId).trim();
  const attemptId = String(input.attemptId).trim();
  uuidToField(learnerId);
  uuidToField(attemptId);
  const blinding = input.blinding === undefined
    ? generateSecureBlinding()
    : parseCanonicalDecimal("blinding", input.blinding);
  const commitment = await poseidonCommitment({
    score: input.score,
    blinding,
    learnerId,
    attemptId,
  });
  return {
    publicCommitment: {
      version: 1,
      scheme: COMMITMENT_SCHEME,
      circuitId: CIRCUIT_ID,
      commitment: decimal(commitment),
    },
    opening: {
      score: input.score,
      blinding: decimal(blinding),
      learnerId,
      attemptId,
    },
  };
}

/** True only when the private opening is the Poseidon preimage of the public commitment. */
export async function verifyAssessmentOpening(input) {
  try {
    const created = await createAssessmentCommitment({
      score: input.score,
      learnerId: input.learnerId,
      attemptId: input.attemptId,
      blinding: input.blinding,
    });
    const presented = parseCanonicalDecimal("commitment", publicCommitmentValue(input.commitment));
    return created.publicCommitment.commitment === decimal(presented);
  } catch {
    return false;
  }
}
