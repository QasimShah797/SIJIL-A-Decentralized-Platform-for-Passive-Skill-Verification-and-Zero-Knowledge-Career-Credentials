/**
 * moodle-completion-v1 Groth16 proof generation for share private-result mode.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { MOODLE_ARTIFACT_FILES, resolveMoodleZkpArtifactDir } from "./moodle-zkp-artifacts";
import { SHARE_MOODLE_THRESHOLD_PERCENT } from "./zkp-policy";

const requireSnarkjs = createRequire(__filename);

interface Groth16Result {
  proof: unknown;
  publicSignals: string[];
}

interface Snarkjs {
  groth16: {
    fullProve(
      input: Record<string, string>,
      wasm: string,
      zkey: string,
    ): Promise<Groth16Result>;
  };
}

export interface MoodleProofInput {
  completed: number;
  required: number;
  blinding: string;
  learnerId: string;
  evidenceId: string;
  commitment: string;
  thresholdPercent?: number;
}

function uuidToDecimal(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error("Invalid UUID");
  }
  return BigInt(`0x${value.replaceAll("-", "")}`).toString();
}

function unsigned32(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 4294967295;
}

export async function generateMoodleCompletionProof(
  input: MoodleProofInput,
): Promise<Groth16Result> {
  const thresholdPercent = input.thresholdPercent ?? SHARE_MOODLE_THRESHOLD_PERCENT;
  if (!unsigned32(input.completed) || !unsigned32(input.required)) {
    throw new Error("completed and required must be unsigned 32-bit integers");
  }
  if (!Number.isInteger(thresholdPercent) || thresholdPercent < 0 || thresholdPercent > 100) {
    throw new Error("thresholdPercent must be an integer from 0 through 100");
  }
  if (input.required < 1) {
    throw new Error("required must be >= 1");
  }
  if (input.completed > input.required) {
    throw new Error("completed cannot exceed required");
  }
  if (input.completed * 100 < input.required * thresholdPercent) {
    throw new Error("Moodle completion does not meet the threshold");
  }

  const artifactDir = resolveMoodleZkpArtifactDir();
  if (!artifactDir) {
    throw new Error("Trusted Moodle ZKP artifacts are unavailable");
  }

  const snarkjs = requireSnarkjs("snarkjs") as Snarkjs;
  const result = await snarkjs.groth16.fullProve(
    {
      completed: String(input.completed),
      required: String(input.required),
      blinding: input.blinding,
      learnerId: uuidToDecimal(input.learnerId),
      evidenceId: uuidToDecimal(input.evidenceId),
      thresholdPercent: String(thresholdPercent),
      commitment: input.commitment,
    },
    path.join(artifactDir, MOODLE_ARTIFACT_FILES.wasm),
    path.join(artifactDir, MOODLE_ARTIFACT_FILES.zkey),
  );

  if (
    result.publicSignals.length !== 2 ||
    result.publicSignals[0] !== String(thresholdPercent) ||
    result.publicSignals[1] !== input.commitment
  ) {
    throw new Error("Moodle ZKP public signals do not match the requested values");
  }

  return result;
}
