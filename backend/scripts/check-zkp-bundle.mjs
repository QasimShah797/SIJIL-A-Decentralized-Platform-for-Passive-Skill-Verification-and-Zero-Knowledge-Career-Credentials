/**
 * Production-style check: load snarkjs and the pinned key from the compiled
 * backend, hash the shipped bundle, then verify a real Groth16 proof.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(backendRoot, "zkp-artifacts/score-threshold-v1");
process.env.SIJIL_ZKP_ARTIFACT_DIR = artifactDir;

const require = createRequire(path.join(backendRoot, "package.json"));
const { readPinnedVerificationKey } = require(path.join(backendRoot, "dist/services/zkp-verify.js"));
const { PINNED_VERIFICATION_KEY_SHA256 } = require(path.join(backendRoot, "dist/services/zkp-artifacts.js"));
const pinned = readPinnedVerificationKey();
if (!pinned || pinned.sha256 !== PINNED_VERIFICATION_KEY_SHA256 || pinned.pinnedSha256 !== PINNED_VERIFICATION_KEY_SHA256) {
  throw new Error("pinned verification key failed its SHA-256 check");
}

const hashes = JSON.parse(readFileSync(path.join(artifactDir, "hashes.json"), "utf8"));
for (const [file, name] of [
  ["score_threshold.wasm", "wasm"],
  ["score_threshold_final.zkey", "zkey"],
]) {
  const digest = createHash("sha256").update(readFileSync(path.join(artifactDir, file))).digest("hex");
  if (digest !== hashes[name]) throw new Error(`${file} failed its SHA-256 check`);
}

const snarkjs = require("snarkjs");
const commitment = await import(pathToFileURL(path.join(backendRoot, "dist/zkp/commitment.mjs")).href);
const proved = await snarkjs.groth16.fullProve({
  score: "73",
  blinding: "42",
  learnerId: commitment.decimal(commitment.uuidToField("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")),
  attemptId: commitment.decimal(commitment.uuidToField("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")),
  threshold: "60",
  commitment: "4507768595048672970581706270570294537909576572913353501816464357845450185450",
}, path.join(artifactDir, "score_threshold.wasm"), path.join(artifactDir, "score_threshold_final.zkey"));

const verified = await snarkjs.groth16.verify(pinned.key, proved.publicSignals, proved.proof);
if (!verified) throw new Error("compiled backend could not verify the Groth16 proof");
const curve = globalThis.curve_bn128;
if (curve?.terminate) await curve.terminate();
console.log("PRODUCTION_ZKP_VERIFY_OK");
