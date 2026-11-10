/**
 * Real Groth16 tests for score-threshold-v1.
 * Invalid witnesses are rejected by the prover. Tampered proofs and the wrong
 * verification key are rejected by snarkjs verification. Nothing here is mocked.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import * as snarkjs from "snarkjs";
import { decimal, poseidonCommitment, randomBlinding, uuidToField } from "../src/commitment.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = path.join(root, "build");
const wasmPath = path.join(buildDir, "score_threshold_js", "score_threshold.wasm");
const zkeyPath = path.join(buildDir, "score_threshold_final.zkey");

const LEARNER_UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ATTEMPT_UUID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const verificationKey = JSON.parse(await readFile(path.join(buildDir, "verification_key.json"), "utf8"));
const wrongVerificationKey = JSON.parse(await readFile(path.join(buildDir, "verification_key_wrong.json"), "utf8"));

after(async () => {
  if (globalThis.curve_bn128?.terminate) {
    await globalThis.curve_bn128.terminate();
  }
});

function witness(input) {
  return {
    score: decimal(input.score),
    blinding: decimal(input.blinding),
    learnerId: decimal(input.learnerId),
    attemptId: decimal(input.attemptId),
    threshold: decimal(input.threshold),
    commitment: decimal(input.commitment),
  };
}

async function committedInput(score, threshold, blinding = randomBlinding()) {
  const learnerId = uuidToField(LEARNER_UUID);
  const attemptId = uuidToField(ATTEMPT_UUID);
  const commitment = await poseidonCommitment({ score, blinding, learnerId, attemptId });
  return { score, threshold, blinding, learnerId, attemptId, commitment };
}

async function prove(input) {
  return snarkjs.groth16.fullProve(witness(input), wasmPath, zkeyPath);
}

function assertPrivateHidden(input, publicSignals) {
  const hidden = [decimal(input.score), decimal(input.blinding), decimal(input.learnerId), decimal(input.attemptId)];
  for (const value of hidden) {
    assert.equal(publicSignals.includes(value), false, "private witness value appeared as a public signal");
  }
}

async function assertProverRejects(input) {
  await assert.rejects(() => prove(input));
}

test("score 73 meets threshold 60", async () => {
  const input = await committedInput(73, 60);
  const { proof, publicSignals } = await prove(input);
  assert.deepEqual(publicSignals, [decimal(60), decimal(input.commitment)]);
  assertPrivateHidden(input, publicSignals);
  assert.equal(await snarkjs.groth16.verify(verificationKey, publicSignals, proof), true);
});

test("score 59 does not meet threshold 60", async () => {
  await assertProverRejects(await committedInput(59, 60));
});

test("score 100 meets threshold 100", async () => {
  const input = await committedInput(100, 100);
  const { proof, publicSignals } = await prove(input);
  assert.equal(await snarkjs.groth16.verify(verificationKey, publicSignals, proof), true);
});

test("score 0 meets threshold 0", async () => {
  const input = await committedInput(0, 0);
  const { proof, publicSignals } = await prove(input);
  assert.equal(await snarkjs.groth16.verify(verificationKey, publicSignals, proof), true);
});

test("score 101 is outside the range", async () => {
  await assertProverRejects(await committedInput(101, 60));
});

test("threshold 101 is outside the range", async () => {
  await assertProverRejects(await committedInput(80, 101));
});

test("incorrect commitment is rejected by the prover", async () => {
  const input = await committedInput(73, 60);
  input.commitment += 1n;
  await assertProverRejects(input);
});

test("modified public threshold is rejected by the verifier", async () => {
  const input = await committedInput(73, 60);
  const { proof, publicSignals } = await prove(input);
  const tampered = [decimal(61), publicSignals[1]];
  assert.equal(await snarkjs.groth16.verify(verificationKey, tampered, proof), false);
});

test("modified public commitment is rejected by the verifier", async () => {
  const input = await committedInput(73, 60);
  const { proof, publicSignals } = await prove(input);
  const tamperedCommitment = (BigInt(publicSignals[1]) + 1n).toString(10);
  assert.equal(await snarkjs.groth16.verify(verificationKey, [publicSignals[0], tamperedCommitment], proof), false);
});

test("tampered proof is rejected", async () => {
  const input = await committedInput(73, 60);
  const { proof, publicSignals } = await prove(input);
  const tampered = structuredClone(proof);
  tampered.pi_a[0] = (BigInt(tampered.pi_a[0]) + 1n).toString(10);
  let rejected = false;
  try {
    rejected = (await snarkjs.groth16.verify(verificationKey, publicSignals, tampered)) === false;
  } catch {
    rejected = true;
  }
  assert.equal(rejected, true);
});

test("wrong verification key is rejected", async () => {
  const input = await committedInput(73, 60);
  const { proof, publicSignals } = await prove(input);
  let rejected = false;
  try {
    rejected = (await snarkjs.groth16.verify(wrongVerificationKey, publicSignals, proof)) === false;
  } catch {
    rejected = true;
  }
  assert.equal(rejected, true);
});
