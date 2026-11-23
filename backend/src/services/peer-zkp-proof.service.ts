/**
 * peer-review-count-v1 Groth16 proof generation for share private-result mode.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { PEER_ARTIFACT_FILES, resolvePeerZkpArtifactDir } from "./peer-zkp-artifacts";
import { SHARE_PEER_REVIEW_THRESHOLD } from "./zkp-policy";

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

export interface PeerProofInput {
  count: number;
  blinding: string;
  learnerId: string;
  evidenceId: string;
  commitment: string;
  threshold?: number;
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

export async function generatePeerReviewCountProof(
  input: PeerProofInput,
): Promise<Groth16Result> {
  const threshold = input.threshold ?? SHARE_PEER_REVIEW_THRESHOLD;
  if (!unsigned32(input.count) || !unsigned32(threshold)) {
    throw new Error("count and threshold must be unsigned 32-bit integers");
  }
  if (input.count < threshold) {
    throw new Error("Peer review count does not meet the threshold");
  }

  const artifactDir = resolvePeerZkpArtifactDir();
  if (!artifactDir) {
    throw new Error("Trusted Peer Review ZKP artifacts are unavailable");
  }

  const snarkjs = requireSnarkjs("snarkjs") as Snarkjs;
  const result = await snarkjs.groth16.fullProve(
    {
      count: String(input.count),
      blinding: input.blinding,
      learnerId: uuidToDecimal(input.learnerId),
      evidenceId: uuidToDecimal(input.evidenceId),
      threshold: String(threshold),
      commitment: input.commitment,
    },
    path.join(artifactDir, PEER_ARTIFACT_FILES.wasm),
    path.join(artifactDir, PEER_ARTIFACT_FILES.zkey),
  );

  if (
    result.publicSignals.length !== 2 ||
    result.publicSignals[0] !== String(threshold) ||
    result.publicSignals[1] !== input.commitment
  ) {
    throw new Error("Peer Review ZKP public signals do not match the requested values");
  }

  return result;
}
