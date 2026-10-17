/**
 * Place the verified public bundle next to the compiled backend.
 * A production process can then load it without the circuits working tree.
 */
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.resolve(backendRoot, "../zkp-artifacts/score-threshold-v1");
const destination = path.join(backendRoot, "zkp-artifacts/score-threshold-v1");
const names = ["score_threshold.wasm", "score_threshold_final.zkey", "verification_key.json", "hashes.json"];
const hashNames = {
  "score_threshold.wasm": "wasm",
  "score_threshold_final.zkey": "zkey",
  "verification_key.json": "verificationKey",
};

const hashes = JSON.parse(readFileSync(path.join(source, "hashes.json"), "utf8"));
rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });
for (const name of names) {
  const bytes = readFileSync(path.join(source, name));
  const expected = hashNames[name];
  if (expected && createHash("sha256").update(bytes).digest("hex") !== hashes[expected]) {
    throw new Error(`${name} does not match the pinned hash`);
  }
  copyFileSync(path.join(source, name), path.join(destination, name));
}
mkdirSync(path.join(backendRoot, "dist/zkp"), { recursive: true });
copyFileSync(
  path.join(backendRoot, "src/zkp/commitment.mjs"),
  path.join(backendRoot, "dist/zkp/commitment.mjs"),
);
console.log("Copied the verified ZKP bundle into backend/zkp-artifacts");
