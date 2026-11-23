import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, it } from "node:test";
import {
  assessBelowBundle,
  clearBelowDestination,
  copyVerifiedBelowBundle,
} from "./copy-zkp-below-bundle.mjs";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(backendRoot, "..");
const realBelow = path.join(repoRoot, "zkp-artifacts/score-threshold-v1-below");
const tempRoots = [];

afterEach(() => {
  for (const dir of tempRoots.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function makeSyntheticBelowBundle() {
  const dir = mkdtempSync(path.join(tmpdir(), "sijil-below-ready-"));
  tempRoots.push(dir);
  const wasm = Buffer.from("synthetic-score-below-wasm");
  const zkey = Buffer.from("synthetic-score-below-zkey");
  const vk = Buffer.from('{"protocol":"groth16","curve":"bn128","synthetic":true}');
  writeFileSync(path.join(dir, "score_below.wasm"), wasm);
  writeFileSync(path.join(dir, "score_below_final.zkey"), zkey);
  writeFileSync(path.join(dir, "verification_key.json"), vk);
  writeFileSync(
    path.join(dir, "hashes.json"),
    JSON.stringify({
      wasm: sha256(wasm),
      zkey: sha256(zkey),
      verificationKey: sha256(vk),
    }),
  );
  return dir;
}

describe("below bundle copy helpers", () => {
  it("reports missing .zkey on the real incomplete workspace bundle", () => {
    const result = assessBelowBundle(realBelow, "score-threshold-v1-below", "score_below.wasm", "score_below_final.zkey");
    assert.equal(result.status, "missing");
    assert.equal(result.file, "score_below_final.zkey");
  });

  it("copies a complete hash-verified synthetic bundle", () => {
    const source = makeSyntheticBelowBundle();
    const dest = path.join(source, "dest");
    const assessment = assessBelowBundle(source, "score-threshold-v1-below", "score_below.wasm", "score_below_final.zkey");
    assert.equal(assessment.status, "ready");
    copyVerifiedBelowBundle(source, dest, assessment.belowNames);
    assert.ok(existsSync(path.join(dest, "score_below_final.zkey")));
    assert.ok(existsSync(path.join(dest, "verification_key.json")));
    assert.ok(existsSync(path.join(dest, "hashes.json")));
  });

  it("fails closed on hash mismatch instead of skipping", () => {
    const source = makeSyntheticBelowBundle();
    const keyPath = path.join(source, "score_below_final.zkey");
    writeFileSync(keyPath, Buffer.concat([readFileSync(keyPath), Buffer.from("x")]));
    const result = assessBelowBundle(source, "score-threshold-v1-below", "score_below.wasm", "score_below_final.zkey");
    assert.equal(result.status, "mismatch");
    assert.equal(result.file, "score_below_final.zkey");
  });

  it("removes a stale destination when the source bundle is incomplete", () => {
    const staleDest = mkdtempSync(path.join(tmpdir(), "sijil-stale-below-dest-"));
    tempRoots.push(staleDest);
    writeFileSync(path.join(staleDest, "stale.txt"), "old-copy");
    const result = assessBelowBundle(realBelow, "score-threshold-v1-below", "score_below.wasm", "score_below_final.zkey");
    assert.equal(result.status, "missing");
    clearBelowDestination(staleDest);
    assert.equal(existsSync(staleDest), false);
  });
});