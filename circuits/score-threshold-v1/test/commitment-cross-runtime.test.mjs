/**
 * The Edge Function loads this same module under Deno.
 * These checks fail unless Deno and Node produce the same Poseidon commitment.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createAssessmentCommitment } from "../src/commitment.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(root, "../..");
const LEARNER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ATTEMPT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function denoBinary() {
  const candidates = [
    process.env.DENO,
    path.join(root, ".tools", "deno"),
    "/tmp/deno-bin/deno",
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate));
}

function commitmentFromDeno(configPath) {
  const deno = denoBinary();
  assert.ok(deno, "Deno is required to verify the Edge Function Poseidon implementation");
  const script = `
    import { createAssessmentCommitment } from "./src/commitment.mjs";
    const created = await createAssessmentCommitment({
      score: 73,
      learnerId: ${JSON.stringify(LEARNER_ID)},
      attemptId: ${JSON.stringify(ATTEMPT_ID)},
      blinding: "42",
    });
    if (created.opening.learnerId !== ${JSON.stringify(LEARNER_ID)}) {
      throw new Error("deno learner id mismatch");
    }
    if (created.opening.attemptId !== ${JSON.stringify(ATTEMPT_ID)}) {
      throw new Error("deno attempt id mismatch");
    }
    console.log(created.publicCommitment.commitment);
  `;
  const result = spawnSync(deno, ["eval", `--config=${configPath}`, script], {
    cwd: root,
    encoding: "utf8",
    timeout: 60000,
    env: {
      ...process.env,
      DENO_DIR: path.join(root, ".tools", "deno-cache"),
    },
  });
  assert.equal(
    result.status,
    0,
    `Deno commitment failed\n${result.stdout}\n${result.stderr}`,
  );
  return result.stdout.trim().split("\n").at(-1);
}

test("Deno with the circuit node_modules matches the Node Poseidon commitment", async () => {
  const created = await createAssessmentCommitment({
    score: 73,
    learnerId: LEARNER_ID,
    attemptId: ATTEMPT_ID,
    blinding: "42",
  });
  const denoCommitment = commitmentFromDeno(path.join(root, "deno.json"));
  assert.equal(denoCommitment, created.publicCommitment.commitment);
  assert.equal(created.opening.score, 73);
});

test("Deno with the Edge Function import map matches the Node Poseidon commitment", async () => {
  const created = await createAssessmentCommitment({
    score: 73,
    learnerId: LEARNER_ID,
    attemptId: ATTEMPT_ID,
    blinding: "42",
  });
  const denoCommitment = commitmentFromDeno(path.join(repoRoot, "supabase/functions/deno.json"));
  assert.equal(denoCommitment, created.publicCommitment.commitment);
});
