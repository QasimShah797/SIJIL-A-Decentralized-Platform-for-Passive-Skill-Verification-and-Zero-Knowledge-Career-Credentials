/**
 * GitHub Contributions v1 Groth16 proof generation (meets or below).
 * Development-only setup; does not independently authenticate GitHub data.
 * A failed meets proof is never treated as evidence of BELOW_THRESHOLD.
 */
import { createRequire } from "node:module";
import path from "node:path";
import {
  githubArtifactFilenames,
  resolveGitHubZkpArtifactDir,
} from "./github-zkp-artifacts";
import type { CircuitVariant } from "./zkp-policy";

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

export interface GitHubProofInput {
  count: number;
  blinding: string;
  learnerId: string;
  snapshotId: string;
  threshold: number;
  commitment: string;
  /** Explicit circuit variant. Required when generating below proofs. */
  variant?: CircuitVariant;
}

function uuidToDecimal(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error("Invalid UUID");
  }
  return BigInt("0x" + value.replaceAll("-", "")).toString();
}

function unsigned32(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 4294967295;
}

export async function generateGitHubContributionProof(
  input: GitHubProofInput,
): Promise<Groth16Result> {
  if (!unsigned32(input.count) || !unsigned32(input.threshold)) {
    throw new Error("Count and threshold must be unsigned 32-bit integers");
  }

  const variant: CircuitVariant = input.variant ?? "meets";
  if (variant === "meets") {
    if (input.count < input.threshold) {
      throw new Error("GitHub contributions do not meet the threshold");
    }
  } else if (input.count >= input.threshold) {
    throw new Error("GitHub contributions are not below the threshold");
  }

  const artifactDir = resolveGitHubZkpArtifactDir(variant);
  if (!artifactDir) {
    throw new Error("Trusted GitHub ZKP artifacts are unavailable");
  }

  const files = githubArtifactFilenames(variant);
  const snarkjs = requireSnarkjs("snarkjs") as Snarkjs;

  const result = await snarkjs.groth16.fullProve(
    {
      count: String(input.count),
      blinding: input.blinding,
      learnerId: uuidToDecimal(input.learnerId),
      snapshotId: uuidToDecimal(input.snapshotId),
      threshold: String(input.threshold),
      commitment: input.commitment,
    },
    path.join(artifactDir, files.wasm),
    path.join(artifactDir, files.zkey),
  );

  if (
    result.publicSignals.length !== 2 ||
    result.publicSignals[0] !== String(input.threshold) ||
    result.publicSignals[1] !== input.commitment
  ) {
    throw new Error("GitHub ZKP public signals do not match the requested values");
  }

  return result;
}
