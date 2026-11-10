/**
 * Copy the public score-threshold-v1 artifacts into zkp-artifacts.
 * Refuses to copy powers of tau, contribution keys, or witnesses.
 * The current ceremony in circuits/score-threshold-v1/scripts/setup-dev.mjs
 * is a development setup. It is not a production trusted setup.
 */
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "circuits/score-threshold-v1/build");
const destination = path.join(root, "zkp-artifacts/score-threshold-v1");

const files = {
  wasm: ["score_threshold_js/score_threshold.wasm", "score_threshold.wasm"],
  zkey: ["score_threshold_final.zkey", "score_threshold_final.zkey"],
  verificationKey: ["verification_key.json", "verification_key.json"],
};

const hashes = JSON.parse(readFileSync(path.join(source, "hashes.json"), "utf8"));

mkdirSync(destination, { recursive: true });
for (const [name, [from, to]] of Object.entries(files)) {
  const bytes = readFileSync(path.join(source, from));
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== hashes[name]) {
    throw new Error(`${name} hash ${digest} does not match hashes.json`);
  }
  copyFileSync(path.join(source, from), path.join(destination, to));
}
copyFileSync(path.join(source, "hashes.json"), path.join(destination, "hashes.json"));
console.log("Published score-threshold-v1 bundle to zkp-artifacts/score-threshold-v1");
