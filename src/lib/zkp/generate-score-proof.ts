/**
 * Browser Groth16 proving for score-threshold-v1.
 * snarkjs and the proving artifacts are loaded only when the learner generates a proof.
 * The private witness is not logged.
 */
export const SCORE_THRESHOLD_CIRCUIT_ID = "score-threshold-v1";
export const ZKP_ARTIFACT_BASE = "/zkp/score-threshold-v1";

export interface ScoreWitness {
  score: string;
  blinding: string;
  learnerId: string;
  attemptId: string;
}

export interface ArtifactHashes {
  wasm: string;
  zkey: string;
  verificationKey: string;
}

export interface ScoreProofResult {
  proof: unknown;
  publicSignals: string[];
  circuitId: typeof SCORE_THRESHOLD_CIRCUIT_ID;
  credentialId: string;
  locallyVerified: boolean;
}

const CANONICAL_DECIMAL = /^(0|[1-9][0-9]*)$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;

export function assertProofInputs(witness: ScoreWitness, threshold: number, commitment: string): void {
  if (!Number.isInteger(threshold) || threshold < 0 || threshold > 100) {
    throw new Error("Choose a whole-number threshold from 0 to 100.");
  }
  if (!CANONICAL_DECIMAL.test(witness.score) || Number(witness.score) > 100) {
    throw new Error("The credential witness is not a valid assessment score.");
  }
  if (!CANONICAL_DECIMAL.test(witness.blinding) || !CANONICAL_DECIMAL.test(witness.learnerId) || !CANONICAL_DECIMAL.test(witness.attemptId)) {
    throw new Error("The credential witness is incomplete.");
  }
  if (!CANONICAL_DECIMAL.test(commitment)) {
    throw new Error("The credential commitment is not in canonical form.");
  }
  if (Number(witness.score) < threshold) {
    throw new Error("The private score does not meet this threshold.");
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function assertArtifactHash(bytes: Uint8Array, expected: string, label: string): Promise<void> {
  if (!SHA256_HEX.test(expected)) {
    throw new Error("The proving artifacts are not pinned to a trusted setup.");
  }
  const actual = await sha256Hex(bytes);
  if (actual !== expected) {
    throw new Error(`The ${label} does not match the pinned trusted setup.`);
  }
}

export async function generateScoreThresholdProof(input: {
  credentialId: string;
  commitment: string;
  threshold: number;
  witness: ScoreWitness;
  wasm: Uint8Array;
  zkey: Uint8Array;
  verificationKeyBytes: Uint8Array;
  artifactHashes: ArtifactHashes;
}): Promise<ScoreProofResult> {
  assertProofInputs(input.witness, input.threshold, input.commitment);
  await assertArtifactHash(input.wasm, input.artifactHashes.wasm, "circuit program");
  await assertArtifactHash(input.zkey, input.artifactHashes.zkey, "proving key");
  await assertArtifactHash(input.verificationKeyBytes, input.artifactHashes.verificationKey, "verification key");

  const verificationKey = JSON.parse(new TextDecoder().decode(input.verificationKeyBytes)) as object;
  const snarkjs = await import("snarkjs") as {
    groth16: {
      fullProve: (circuitInput: Record<string, string>, wasm: Uint8Array, zkey: Uint8Array) => Promise<{ proof: unknown; publicSignals: string[] }>;
      verify: (key: object, publicSignals: string[], proof: unknown) => Promise<boolean>;
    };
  };

  const circuitInput = {
    score: input.witness.score,
    blinding: input.witness.blinding,
    learnerId: input.witness.learnerId,
    attemptId: input.witness.attemptId,
    threshold: String(input.threshold),
    commitment: input.commitment,
  };
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(circuitInput, input.wasm, input.zkey);
  const signalsMatch = publicSignals.length === 2
    && publicSignals[0] === String(input.threshold)
    && publicSignals[1] === input.commitment
    && !publicSignals.includes(input.witness.score)
    && !publicSignals.includes(input.witness.blinding)
    && !publicSignals.includes(input.witness.learnerId)
    && !publicSignals.includes(input.witness.attemptId);
  const locallyVerified = signalsMatch && await snarkjs.groth16.verify(verificationKey, publicSignals, proof);
  if (!locallyVerified) {
    throw new Error("The local proof check did not succeed.");
  }
  return {
    proof,
    publicSignals,
    circuitId: SCORE_THRESHOLD_CIRCUIT_ID,
    credentialId: input.credentialId,
    locallyVerified,
  };
}

export async function loadPinnedArtifacts(base = ZKP_ARTIFACT_BASE): Promise<{
  wasm: Uint8Array;
  zkey: Uint8Array;
  verificationKeyBytes: Uint8Array;
}> {
  async function load(name: string): Promise<Uint8Array> {
    const response = await fetch(`${base}/${name}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("The zero-knowledge artifacts are not available in this build.");
    }
    return new Uint8Array(await response.arrayBuffer());
  }
  const [wasm, zkey, verificationKeyBytes] = await Promise.all([
    load("score_threshold.wasm"),
    load("score_threshold_final.zkey"),
    load("verification_key.json"),
  ]);
  return { wasm, zkey, verificationKeyBytes };
}
