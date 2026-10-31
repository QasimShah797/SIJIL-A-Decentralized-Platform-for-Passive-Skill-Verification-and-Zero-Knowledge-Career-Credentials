/**
 * Cryptographic verification for github-contributions-v1 (meets or below).
 *
 * A valid proof does NOT independently establish GitHub authenticity.
 * The caller must separately verify the trusted snapshot binding.
 * Use the matching verification key for the circuit variant.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  githubArtifactFilenames,
  resolveGitHubZkpArtifactDir,
} from "./github-zkp-artifacts";
import { readGroth16Proof } from "./zkp-verify";
import type { CircuitVariant } from "./zkp-policy";

const CIRCUIT_ID = "github-contributions-v1";
const DECIMAL = /^(0|[1-9][0-9]*)$/;
const MAX_U32 = 4294967295n;
const BN254_FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export interface GitHubZkpSubmission {
  circuitId: unknown;
  proof: unknown;
  publicSignals: unknown;
}

export interface GitHubZkpVerificationResult {
  cryptographicallyValid: boolean;
  circuitId: string;
  threshold: string | null;
  reason: string;
  variant?: CircuitVariant;
}

function readField(value: unknown): bigint | null {
  if (
    typeof value !== "string" ||
    value.length > 80 ||
    !DECIMAL.test(value)
  ) return null;

  const parsed = BigInt(value);
  return parsed < BN254_FIELD ? parsed : null;
}

export async function verifyGitHubContributionProof(
  submission: GitHubZkpSubmission,
  expectedCommitment: string,
  variant: CircuitVariant = "meets",
): Promise<GitHubZkpVerificationResult> {
  const fail = (reason: string, threshold: string | null = null): GitHubZkpVerificationResult => ({
    cryptographicallyValid: false,
    circuitId: CIRCUIT_ID,
    threshold,
    reason,
    variant,
  });

  if (submission.circuitId !== CIRCUIT_ID) {
    return fail("Unsupported GitHub ZKP circuit");
  }

  const proof = readGroth16Proof(submission.proof);
  if (!proof) return fail("Malformed Groth16 proof");

  if (
    !Array.isArray(submission.publicSignals) ||
    submission.publicSignals.length !== 2
  ) return fail("Malformed public signals");

  const [threshold, commitment] = submission.publicSignals;
  const thresholdValue = readField(threshold);
  const commitmentValue = readField(commitment);
  const expectedValue = readField(expectedCommitment);

  if (
    thresholdValue === null ||
    thresholdValue > MAX_U32 ||
    commitmentValue === null ||
    expectedValue === null
  ) return fail("Invalid threshold or commitment");

  if (commitment !== expectedCommitment) {
    return fail("Commitment does not match the trusted value", threshold);
  }

  const artifactDir = resolveGitHubZkpArtifactDir(variant);
  if (!artifactDir) return fail("Pinned GitHub ZKP artifacts unavailable", threshold);

  try {
    const files = githubArtifactFilenames(variant);
    const verificationKey = JSON.parse(
      readFileSync(path.join(artifactDir, files.verificationKey), "utf8"),
    );

    const snarkjs = createRequire(__filename)("snarkjs") as {
      groth16: {
        verify(
          key: object,
          signals: string[],
          proof: unknown,
        ): Promise<boolean>;
      };
    };

    const valid = await snarkjs.groth16.verify(
      verificationKey,
      [threshold, commitment],
      proof,
    );

    return {
      cryptographicallyValid: valid === true,
      circuitId: CIRCUIT_ID,
      threshold,
      variant,
      reason: valid === true
        ? "Groth16 proof is cryptographically valid; GitHub authenticity requires separate verification"
        : "Invalid Groth16 proof",
    };
  } catch {
    return fail("Groth16 verification failed", threshold);
  }
}
