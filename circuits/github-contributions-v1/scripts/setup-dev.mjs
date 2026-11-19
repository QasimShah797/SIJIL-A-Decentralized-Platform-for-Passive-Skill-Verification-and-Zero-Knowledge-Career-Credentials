/**
 * Development-only Groth16 setup for github-contributions-v1.
 * Uses the same pinned Circom 2.1.9 linux-amd64 binary and snarkjs 0.7.5
 * as score-threshold-v1. Entropy is not written to disk.
 * This is not a production ceremony.
 */
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { chmod, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(root, "../..");
const scoreRoot = path.join(repo, "circuits", "score-threshold-v1");
const buildDir = path.join(root, "build");
const toolsDir = path.join(scoreRoot, ".tools");
const circomPath = path.join(toolsDir, "circom");
const snarkjsPath = path.join(scoreRoot, "node_modules", "snarkjs", "build", "cli.cjs");
const circomlib = path.join(scoreRoot, "node_modules", "circomlib", "circuits");
const outDir = path.join(repo, "zkp-artifacts", "github-contributions-v1");
const CIRCOM_VERSION = "2.1.9";
const CIRCOM_URL = `https://github.com/iden3/circom/releases/download/v${CIRCOM_VERSION}/circom-linux-amd64`;
const CIRCOM_SHA256 = "e5575829252d763b7818049df9de2ef9304df834697de77fa63ce7babc23c967";
const PTAU_POWER = 12;

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`command failed (${result.status}): ${command}`);
}

async function sha256File(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

async function ensureCircom() {
  await mkdir(toolsDir, { recursive: true });
  try {
    if (await sha256File(circomPath) === CIRCOM_SHA256) return circomPath;
  } catch { /* download */ }
  if (process.platform !== "linux" || process.arch !== "x64") {
    throw new Error("Circom 2.1.9 is pinned for linux-amd64. Run this setup from WSL Ubuntu.");
  }
  const response = await fetch(CIRCOM_URL);
  if (!response.ok) throw new Error(`Circom download failed: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== CIRCOM_SHA256) {
    throw new Error("Circom checksum mismatch");
  }
  await writeFile(circomPath, bytes);
  await chmod(circomPath, 0o755);
  return circomPath;
}

const circom = await ensureCircom();
await mkdir(buildDir, { recursive: true });
run(circom, [
  path.join(root, "github_contributions.circom"),
  "--r1cs", "--wasm", "--sym", "-o", buildDir, "-l", circomlib,
]);
const pot0 = path.join(buildDir, "pot12_0000.ptau");
const pot1 = path.join(buildDir, "pot12_0001.ptau");
const potFinal = path.join(buildDir, "pot12_final.ptau");
const zkey0 = path.join(buildDir, "github_contributions_0000.zkey");
const zkeyFinal = path.join(buildDir, "github_contributions_final.zkey");
const r1cs = path.join(buildDir, "github_contributions.r1cs");
const entropy = randomBytes(32).toString("hex");
run(process.execPath, [snarkjsPath, "powersoftau", "new", "bn128", String(PTAU_POWER), pot0, "-v"]);
run(process.execPath, [snarkjsPath, "powersoftau", "contribute", pot0, pot1, "--name=sijil-github-contributions-v1-dev", "-v", `-e=${entropy}`]);
run(process.execPath, [snarkjsPath, "powersoftau", "prepare", "phase2", pot1, potFinal, "-v"]);
run(process.execPath, [snarkjsPath, "groth16", "setup", r1cs, potFinal, zkey0]);
run(process.execPath, [snarkjsPath, "zkey", "contribute", zkey0, zkeyFinal, "--name=sijil-github-contributions-v1-dev", "-v", `-e=${entropy}`]);
run(process.execPath, [snarkjsPath, "zkey", "export", "verificationkey", zkeyFinal, path.join(buildDir, "verification_key.json")]);
await rm(pot0, { force: true });
await rm(pot1, { force: true });
await rm(zkey0, { force: true });
await mkdir(outDir, { recursive: true });
const wasm = path.join(buildDir, "github_contributions_js", "github_contributions.wasm");
await copyFile(wasm, path.join(outDir, "github_contributions.wasm"));
await copyFile(zkeyFinal, path.join(outDir, "github_contributions_final.zkey"));
await copyFile(path.join(buildDir, "verification_key.json"), path.join(outDir, "verification_key.json"));
const hashes = {
  wasm: await sha256File(path.join(outDir, "github_contributions.wasm")),
  zkey: await sha256File(path.join(outDir, "github_contributions_final.zkey")),
  verificationKey: await sha256File(path.join(outDir, "verification_key.json")),
  setup: "development-only",
  circuit: "github_contributions",
  circomVersion: CIRCOM_VERSION,
  snarkjs: "0.7.5",
  publicSignals: ["threshold", "commitment"],
  note: "Single-contributor development setup. Not production-secure.",
};
await writeFile(path.join(outDir, "hashes.json"), `${JSON.stringify(hashes, null, 2)}\n`);
console.log(JSON.stringify({ wasm: hashes.wasm, zkey: hashes.zkey, verificationKey: hashes.verificationKey }));
