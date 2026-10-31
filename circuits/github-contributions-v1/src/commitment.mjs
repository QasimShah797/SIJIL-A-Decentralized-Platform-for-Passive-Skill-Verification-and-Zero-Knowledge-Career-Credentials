import { buildPoseidon } from "../../score-threshold-v1/node_modules/circomlibjs/main.js";
import {
  randomBytes,
} from "node:crypto";

export const CIRCUIT_ID = "github-contributions-v1";
export const DOMAIN_LABEL = "SIJIL-GITHUB-v1";
export const DOMAIN_FIELD = BigInt("0x53494a494c2d4749544855422d7631");

export const BN254_FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

const MAX_COUNT = 4294967295n;

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

function parseCount(value) {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > Number(MAX_COUNT)
  ) {
    throw new Error("Contribution count must be a 32-bit unsigned integer");
  }
  return BigInt(value);
}

function generateBlinding() {
  return BigInt(`0x${randomBytes(31).toString("hex")}`);
}

export async function createGitHubCommitment({
  count,
  learnerId,
  snapshotId,
  blinding,
}) {
  const verifiedCount = parseCount(count);
  const learnerField = uuidToField(learnerId);
  const snapshotField = uuidToField(snapshotId);

  const secret =
    blinding === undefined ? generateBlinding() : BigInt(blinding);

  assertField("blinding", secret);

  const poseidon = await buildPoseidon();

  const digest = poseidon([
    DOMAIN_FIELD,
    verifiedCount,
    secret,
    learnerField,
    snapshotField,
  ]);

  const commitment = poseidon.F.toString(digest);

  return {
    publicCommitment: {
      version: 1,
      scheme: "poseidon-bn254-v1",
      circuitId: CIRCUIT_ID,
      commitment,
    },
    opening: {
      count,
      blinding: secret.toString(),
      learnerId,
      snapshotId,
    },
  };
}

export async function verifyGitHubOpening({
  count,
  learnerId,
  snapshotId,
  blinding,
  commitment,
}) {
  try {
    if (
      typeof commitment !== "string" ||
      !/^(0|[1-9][0-9]*)$/.test(commitment)
    ) {
      return false;
    }

    const result = await createGitHubCommitment({
      count,
      learnerId,
      snapshotId,
      blinding,
    });

    return result.publicCommitment.commitment === commitment;
  } catch {
    return false;
  }
}
