/**
 * Tests for the reusable assessment commitment API.
 * Poseidon is the real circomlibjs implementation. One case also checks the
 * commitment inside a real Groth16 proof from the Phase 0 circuit.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import * as snarkjs from "snarkjs";
import {
  CIRCUIT_ID,
  COMMITMENT_SCHEME,
  createAssessmentCommitment,
  decimal,
  generateSecureBlinding,
  uuidToField,
  verifyAssessmentOpening,
} from "../src/commitment.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = path.join(root, "build");
const LEARNER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ATTEMPT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER_LEARNER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER_ATTEMPT_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

after(async () => {
  if (globalThis.curve_bn128?.terminate) {
    await globalThis.curve_bn128.terminate();
  }
});

function baseInput(overrides = {}) {
  return {
    score: 73,
    learnerId: LEARNER_ID,
    attemptId: ATTEMPT_ID,
    blinding: 42n,
    ...overrides,
  };
}

const SCORE_73_COMMITMENT = "4507768595048672970581706270570294537909576572913353501816464357845450185450";

test("trusted score 73 commits the learner, attempt, and Phase 0 Poseidon value", async () => {
  const created = await createAssessmentCommitment(baseInput());
  assert.equal(created.opening.score, 73);
  assert.equal(created.opening.learnerId, LEARNER_ID);
  assert.equal(created.opening.attemptId, ATTEMPT_ID);
  assert.equal(created.opening.blinding, "42");
  assert.equal(created.publicCommitment.commitment, SCORE_73_COMMITMENT);
  assert.equal(await verifyAssessmentOpening({
    score: 73,
    learnerId: LEARNER_ID,
    attemptId: ATTEMPT_ID,
    blinding: "42",
    commitment: SCORE_73_COMMITMENT,
  }), true);
  assert.equal(await verifyAssessmentOpening({
    score: 72,
    learnerId: LEARNER_ID,
    attemptId: ATTEMPT_ID,
    blinding: "42",
    commitment: SCORE_73_COMMITMENT,
  }), false);
});

test("creates a public commitment and a private opening", async () => {
  const created = await createAssessmentCommitment(baseInput());
  assert.equal(created.publicCommitment.version, 1);
  assert.equal(created.publicCommitment.scheme, COMMITMENT_SCHEME);
  assert.equal(created.publicCommitment.circuitId, CIRCUIT_ID);
  assert.match(created.publicCommitment.commitment, /^(0|[1-9][0-9]*)$/);
  assert.equal(JSON.stringify(created.publicCommitment).includes(created.opening.blinding), false);
  assert.equal(Object.hasOwn(created.publicCommitment, "score"), false);
  assert.deepEqual(created.opening, {
    score: 73,
    blinding: "42",
    learnerId: LEARNER_ID,
    attemptId: ATTEMPT_ID,
  });
});

test("the same inputs produce the same commitment", async () => {
  const first = await createAssessmentCommitment(baseInput());
  const second = await createAssessmentCommitment(baseInput());
  assert.equal(first.publicCommitment.commitment, second.publicCommitment.commitment);
});

test("a different score changes the commitment", async () => {
  const first = await createAssessmentCommitment(baseInput());
  const second = await createAssessmentCommitment(baseInput({ score: 74 }));
  assert.notEqual(first.publicCommitment.commitment, second.publicCommitment.commitment);
});

test("a different blinding changes the commitment", async () => {
  const first = await createAssessmentCommitment(baseInput());
  const second = await createAssessmentCommitment(baseInput({ blinding: 43n }));
  assert.notEqual(first.publicCommitment.commitment, second.publicCommitment.commitment);
});

test("a different learner id changes the commitment", async () => {
  const first = await createAssessmentCommitment(baseInput());
  const second = await createAssessmentCommitment(baseInput({ learnerId: OTHER_LEARNER_ID }));
  assert.notEqual(first.publicCommitment.commitment, second.publicCommitment.commitment);
});

test("a different attempt id changes the commitment", async () => {
  const first = await createAssessmentCommitment(baseInput());
  const second = await createAssessmentCommitment(baseInput({ attemptId: OTHER_ATTEMPT_ID }));
  assert.notEqual(first.publicCommitment.commitment, second.publicCommitment.commitment);
});

test("rejects scores outside 0 to 100 and non-integers", async () => {
  for (const score of [-1, 101, 1.5, Number.NaN, "73", null]) {
    await assert.rejects(() => createAssessmentCommitment(baseInput({ score })));
  }
  await createAssessmentCommitment(baseInput({ score: 0 }));
  await createAssessmentCommitment(baseInput({ score: 100 }));
});

test("rejects malformed UUIDs", async () => {
  assert.throws(() => uuidToField("not-a-uuid"));
  assert.throws(() => uuidToField("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
  await assert.rejects(() => createAssessmentCommitment(baseInput({ learnerId: "learner" })));
  await assert.rejects(() => createAssessmentCommitment(baseInput({ attemptId: "" })));
});

test("generates a field element from 31 random bytes", () => {
  const first = generateSecureBlinding();
  const second = generateSecureBlinding();
  assert.equal(typeof first, "bigint");
  assert.equal(first >= 0n && first < (1n << 248n), true);
  assert.notEqual(first, second);
});

test("accepts the matching opening and rejects every changed field", async () => {
  const created = await createAssessmentCommitment(baseInput());
  const opening = {
    ...created.opening,
    commitment: created.publicCommitment.commitment,
  };
  assert.equal(await verifyAssessmentOpening(opening), true);
  assert.equal(await verifyAssessmentOpening({ ...opening, score: 72 }), false);
  assert.equal(await verifyAssessmentOpening({ ...opening, blinding: "43" }), false);
  assert.equal(await verifyAssessmentOpening({ ...opening, learnerId: OTHER_LEARNER_ID }), false);
  assert.equal(await verifyAssessmentOpening({ ...opening, attemptId: OTHER_ATTEMPT_ID }), false);
  assert.equal(await verifyAssessmentOpening({
    ...opening,
    commitment: (BigInt(opening.commitment) + 1n).toString(10),
  }), false);
  assert.equal(await verifyAssessmentOpening({ ...opening, commitment: "00" }), false);
});

test("the commitment matches a real Groth16 proof", async () => {
  const created = await createAssessmentCommitment({
    score: 73,
    learnerId: LEARNER_ID,
    attemptId: ATTEMPT_ID,
  });
  const verificationKey = JSON.parse(await readFile(path.join(buildDir, "verification_key.json"), "utf8"));
  const { proof, publicSignals } = await snarkjs.groth16.fullProve({
    score: decimal(created.opening.score),
    blinding: created.opening.blinding,
    learnerId: decimal(uuidToField(created.opening.learnerId)),
    attemptId: decimal(uuidToField(created.opening.attemptId)),
    threshold: "60",
    commitment: created.publicCommitment.commitment,
  }, path.join(buildDir, "score_threshold_js", "score_threshold.wasm"), path.join(buildDir, "score_threshold_final.zkey"));

  assert.deepEqual(publicSignals, ["60", created.publicCommitment.commitment]);
  assert.equal(publicSignals.includes(created.opening.blinding), false);
  assert.equal(publicSignals.includes(decimal(created.opening.score)), false);
  assert.equal(await snarkjs.groth16.verify(verificationKey, publicSignals, proof), true);
  assert.equal(await verifyAssessmentOpening({
    ...created.opening,
    commitment: created.publicCommitment,
  }), true);
});
