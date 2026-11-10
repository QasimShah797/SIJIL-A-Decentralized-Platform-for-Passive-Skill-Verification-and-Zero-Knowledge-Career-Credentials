/**
 * Place the verified public bundle next to the compiled backend.
 * A production process can then load it without the circuits working tree.
 */
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

// Copy GitHub Contributions ZKP artifacts after verifying their pinned hashes.
const githubSource = path.resolve(backendRoot, "../circuits/github-contributions-v1");
const githubDestination = path.join(backendRoot, "zkp-artifacts/github-contributions-v1");
const githubFiles = [
  { source: "github_contributions_js/github_contributions.wasm", target: "github_contributions.wasm", hashKey: "wasm" },
  { source: "github_contributions_final.zkey", target: "github_contributions_final.zkey", hashKey: "zkey" },
  { source: "verification_key.json", target: "verification_key.json", hashKey: "verificationKey" },
];

const githubHashes = JSON.parse(readFileSync(path.join(githubSource, "hashes.json"), "utf8"));

// Verify every source artifact before changing the destination.
for (const artifact of githubFiles) {
  const bytes = readFileSync(path.join(githubSource, artifact.source));
  const actualHash = createHash("sha256").update(bytes).digest("hex");
  if (actualHash !== githubHashes[artifact.hashKey]) {
    throw new Error(`GitHub ZKP artifact hash mismatch: ${artifact.source}`);
  }
}

mkdirSync(githubDestination, { recursive: true });
for (const artifact of githubFiles) {
  copyFileSync(
    path.join(githubSource, artifact.source),
    path.join(githubDestination, artifact.target),
  );
}
copyFileSync(
  path.join(githubSource, "hashes.json"),
  path.join(githubDestination, "hashes.json"),
);

mkdirSync(path.join(backendRoot, "dist/zkp"), { recursive: true });
// Adapt the copied GitHub helper to the backend's installed circomlibjs.
const githubHelperSource = readFileSync(
  path.join(githubSource, "src/commitment.mjs"),
  "utf8",
);
const originalPoseidonImport =
  'from "../../score-threshold-v1/node_modules/circomlibjs/main.js"';
if (!githubHelperSource.includes(originalPoseidonImport)) {
  throw new Error("Unexpected GitHub commitment helper import");
}
const githubHelper = githubHelperSource.replace(
  originalPoseidonImport,
  'from "circomlibjs"',
);
writeFileSync(
  path.join(backendRoot, "dist/zkp/github-contribution-commitment.mjs"),
  githubHelper,
);

console.log("Copied verified GitHub Contributions ZKP artifacts");

// Below-threshold companion circuits. The backend resolvers re-check source-pinned hashes at load time.
for (const [folder, files] of [
  ["score-threshold-v1-below", ["score_below.wasm", "score_below_final.zkey"]],
  ["github-contributions-v1-below", ["github_contributions_below.wasm", "github_contributions_below_final.zkey"]],
]) {
  const belowSource = path.resolve(backendRoot, "../zkp-artifacts", folder);
  const belowDestination = path.join(backendRoot, "zkp-artifacts", folder);
  const belowHashes = JSON.parse(readFileSync(path.join(belowSource, "hashes.json"), "utf8"));
  const belowNames = [[files[0], "wasm"], [files[1], "zkey"], ["verification_key.json", "verificationKey"]];
  for (const [name, key] of belowNames) {
    const digest = createHash("sha256").update(readFileSync(path.join(belowSource, name))).digest("hex");
    if (digest !== belowHashes[key]) throw new Error(`${folder}/${name} does not match its hash manifest`);
  }
  rmSync(belowDestination, { recursive: true, force: true });
  mkdirSync(belowDestination, { recursive: true });
  for (const [name] of [...belowNames, ["hashes.json"]]) {
    copyFileSync(path.join(belowSource, name), path.join(belowDestination, name));
  }
}
console.log("Copied verified below-threshold ZKP artifacts");

console.log("Copied the verified ZKP bundle into backend/zkp-artifacts");
