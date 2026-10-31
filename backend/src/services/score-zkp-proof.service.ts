/**
 * Backend score-threshold-v1 Groth16 proof generation (meets or below).
 * Threshold is always the SIJIL assessment policy constant.
 * A failed meets proof is never treated as evidence of BELOW_THRESHOLD.
 */
import { createRequire } from "node:module";
import path from "node:path";
import {
  resolveZkpArtifactDir,
  scoreArtifactFilenames,
} from "./zkp-artifacts";
import {
  ASSESSMENT_POLICY_THRESHOLD,
  type CircuitVariant,
} from "./zkp-policy";

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

export interface ScoreProofInput {
  score: number;
  blinding: string;
  /** Decimal field element for learner UUID. */
  learnerId: string;
  /** Decimal field element for attempt UUID. */
  attemptId: string;
  commitment: string;
  variant: CircuitVariant;
  /** Ignored when set; policy threshold is always used. */
  threshold?: number;
}

function inScoreRange(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 100;
}

export async function generateScoreThresholdProof(
  input: ScoreProofInput,
): Promise<Groth16Result> {
  const threshold = ASSESSMENT_POLICY_THRESHOLD;
  if (!inScoreRange(input.score) || !inScoreRange(threshold)) {
    throw new Error("Score and threshold must be integers from 0 through 100");
  }

  if (input.variant === "meets") {
    if (input.score < threshold) {
      throw new Error("Assessment score does not meet the policy threshold");
    }
  } else if (input.score >= threshold) {
    throw new Error("Assessment score is not below the policy threshold");
  }

  const artifactDir = resolveZkpArtifactDir(input.variant);
  if (!artifactDir) {
    throw new Error("Trusted score ZKP artifacts are unavailable");
  }

  const files = scoreArtifactFilenames(input.variant);
  const snarkjs = requireSnarkjs("snarkjs") as Snarkjs;

  const result = await snarkjs.groth16.fullProve(
    {
      score: String(input.score),
      blinding: input.blinding,
      learnerId: input.learnerId,
      attemptId: input.attemptId,
      threshold: String(threshold),
      commitment: input.commitment,
    },
    path.join(artifactDir, files.wasm),
    path.join(artifactDir, files.zkey),
  );

  if (
    result.publicSignals.length !== 2 ||
    result.publicSignals[0] !== String(threshold) ||
    result.publicSignals[1] !== input.commitment
  ) {
    throw new Error("Score ZKP public signals do not match the requested values");
  }

  return result;
}
