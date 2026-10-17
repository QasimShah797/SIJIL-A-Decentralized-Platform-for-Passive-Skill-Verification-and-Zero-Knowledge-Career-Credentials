/**
 * @vitest-environment node
 * Real Groth16 proofs with the Phase 0 wasm and proving key. Nothing is mocked.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { assertProofInputs, generateScoreThresholdProof } from "./generate-score-proof";

const root = path.resolve(__dirname, "../../../circuits/score-threshold-v1");
const buildDir = path.join(root, "build");
const LEARNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ATTEMPT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const COMMITMENT = "4507768595048672970581706270570294537909576572913353501816464357845450185450";

const hashes = JSON.parse(readFileSync(path.join(buildDir, "hashes.json"), "utf8")) as {
  wasm: string;
  zkey: string;
  verificationKey: string;
};
const wasm = new Uint8Array(readFileSync(path.join(buildDir, "score_threshold_js/score_threshold.wasm")));
const zkey = new Uint8Array(readFileSync(path.join(buildDir, "score_threshold_final.zkey")));
const verificationKeyBytes = new Uint8Array(readFileSync(path.join(buildDir, "verification_key.json")));

afterAll(async () => {
  const curve = (globalThis as { curve_bn128?: { terminate?: () => Promise<void> } }).curve_bn128;
  if (curve?.terminate) await curve.terminate();
});

async function witness() {
  const mod = await import("../../../circuits/score-threshold-v1/src/commitment.mjs") as {
    decimal: (value: bigint | number) => string;
    uuidToField: (value: string) => bigint;
  };
  return {
    score: "73",
    blinding: "42",
    learnerId: mod.decimal(mod.uuidToField(LEARNER)),
    attemptId: mod.decimal(mod.uuidToField(ATTEMPT)),
  };
}

describe("browser score proof", () => {
  it("generates a real Groth16 proof that threshold 60 verifies", async () => {
    const proof = await generateScoreThresholdProof({
      credentialId: "urn:uuid:sijil:test:circuits",
      commitment: COMMITMENT,
      threshold: 60,
      witness: await witness(),
      wasm,
      zkey,
      verificationKeyBytes,
      artifactHashes: hashes,
    });
    expect(proof.locallyVerified).toBe(true);
    expect(proof.circuitId).toBe("score-threshold-v1");
    expect(proof.publicSignals).toEqual(["60", COMMITMENT]);
    expect(proof.publicSignals.includes("73")).toBe(false);
    expect(proof.publicSignals.includes("42")).toBe(false);
  }, 120000);

  it("rejects a threshold above the score before proving", async () => {
    const fields = await witness();
    expect(() => assertProofInputs(fields, 100, COMMITMENT)).toThrow(/does not meet this threshold/);
  });

  it("rejects a higher threshold inside the circuit", async () => {
    const snarkjs = await import("snarkjs") as {
      groth16: {
        fullProve: (input: Record<string, string>, wasmFile: Uint8Array, zkeyFile: Uint8Array) => Promise<unknown>;
      };
    };
    const fields = await witness();
    await expect(snarkjs.groth16.fullProve({
      ...fields,
      threshold: "100",
      commitment: COMMITMENT,
    }, wasm, zkey)).rejects.toThrow();
  }, 120000);

  it("rejects modified public signals", async () => {
    const snarkjs = await import("snarkjs") as {
      groth16: {
        verify: (key: object, signals: string[], proof: unknown) => Promise<boolean>;
      };
    };
    const proof = await generateScoreThresholdProof({
      credentialId: "urn:uuid:sijil:test:circuits",
      commitment: COMMITMENT,
      threshold: 60,
      witness: await witness(),
      wasm,
      zkey,
      verificationKeyBytes,
      artifactHashes: hashes,
    });
    const verificationKey = JSON.parse(new TextDecoder().decode(verificationKeyBytes)) as object;
    expect(await snarkjs.groth16.verify(verificationKey, ["61", COMMITMENT], proof.proof)).toBe(false);
  }, 120000);
});
