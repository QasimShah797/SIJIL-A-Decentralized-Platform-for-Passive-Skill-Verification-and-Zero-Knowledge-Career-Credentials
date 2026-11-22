import { buildPoseidon } from "../../score-threshold-v1/node_modules/circomlibjs/main.js";
import { randomBytes } from "node:crypto";

export const CIRCUIT_ID = "peer-review-count-v1";
export const DOMAIN_LABEL = "SIJIL-PEER-v1";
export const DOMAIN_FIELD = BigInt("0x53494a494c2d504545522d7631");

export const BN254_FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

const MAX_U32 = 4294967295n;

function assertField(name, value) {
  if (value < 0n || value >= BN254_FIELD) {
    throw new Error(`${name} is outside the BN254 field`);
  }
}

function uuidToField(uuid) {
  const text = String(uuid);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) {
    throw new Error("Invalid UUID");
  }
  return BigInt(`0x${text.replaceAll("-", "")}`);
}

function parseU32(name, value) {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > Number(MAX_U32)
  ) {
    throw new Error(`${name} must be a 32-bit unsigned integer`);
  }
  return BigInt(value);
}

function generateBlinding() {
  return BigInt(`0x${randomBytes(31).toString("hex")}`);
}

export async function createPeerReviewCommitment({
  count,
  learnerId,
  evidenceId,
  blinding,
}) {
  const countField = parseU32("count", count);
  const learnerField = uuidToField(learnerId);
  const evidenceField = uuidToField(evidenceId);
  const secret = blinding === undefined ? generateBlinding() : BigInt(blinding);
  assertField("blinding", secret);

  const poseidon = await buildPoseidon();
  const digest = poseidon([
    DOMAIN_FIELD,
    countField,
    secret,
    learnerField,
    evidenceField,
  ]);

  return {
    publicCommitment: {
      version: 1,
      scheme: "poseidon-bn254-v1",
      circuitId: CIRCUIT_ID,
      commitment: poseidon.F.toString(digest),
    },
    opening: {
      count,
      blinding: secret.toString(),
      learnerId,
      evidenceId,
    },
  };
}

export async function verifyPeerReviewOpening({
  count,
  learnerId,
  evidenceId,
  blinding,
  commitment,
}) {
  try {
    if (typeof commitment !== "string" || !/^(0|[1-9][0-9]*)$/.test(commitment)) {
      return false;
    }
    const result = await createPeerReviewCommitment({
      count,
      learnerId,
      evidenceId,
      blinding,
    });
    return result.publicCommitment.commitment === commitment;
  } catch {
    return false;
  }
}
