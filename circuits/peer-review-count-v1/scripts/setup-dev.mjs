/**
 * Development-only Groth16 setup for peer-review-count-v1.
 * Supports Windows (circom-windows-amd64.exe) and linux-amd64.
 * Entropy is random and not written to disk. Not a production ceremony.
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
const toolsDir = path.join(repo, "circuits", ".tools");
const snarkjsPath = path.join(scoreRoot, "node_modules", "snarkjs", "build", "cli.cjs");
const circomlib = path.join(scoreRoot, "node_modules", "circomlib", "circuits");
const outDir = path.join(repo, "zkp-artifacts", "peer-review-count-v1");

const CIRCOM_VERSION = "2.1.9";
const PTAU_POWER = 12;
const CIRCOM_ASSETS = {
  win32: {
    file: "circom.exe",
    url: `https://github.com/iden3/circom/releases/download/v${CIRCOM_VERSION}/circom-windows-amd64.exe`,
    sha256: "b31d9a9e2cddff16438423869068a9cbc428d37a328d3d1516962a23a1753b17",
  },
  linux: {
    file: "circom",
    url: `https://github.com/iden3/circom/releases/download/v${CIRCOM_VERSION}/circom-linux-amd64`,
    sha256: "e5575829252d763b7818049df9de2ef9304df834697de77fa63ce7babc23c967",
  },
};

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`command failed (${result.status}): ${command}`);
}

async function sha256File(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

async function ensureCircom() {
  const asset = process.platform === "win32" ? CIRCOM_ASSETS.win32 : CIRCOM_ASSETS.linux;
  if (!asset) {
    throw new Error(`Unsupported platform ${process.platform}. Install Circom ${CIRCOM_VERSION} manually.`);
  }
  await mkdir(toolsDir, { recursive: true });
  const circomPath = path.join(toolsDir, asset.file);
  try {
    if ((await sha256File(circomPath)) === asset.sha256) return circomPath;
  } catch {
    // download
  }
  console.log(`[setup] downloading Circom ${CIRCOM_VERSION} (${process.platform})`);
  const response = await fetch(asset.url);
  if (!response.ok) throw new Error(`Circom download failed: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256) {
    throw new Error("Circom checksum mismatch");
  }
  await writeFile(circomPath, bytes);
  if (process.platform !== "win32") await chmod(circomPath, 0o755);
  return circomPath;
}

const circom = await ensureCircom();
await mkdir(buildDir, { recursive: true });
run(circom, [
  path.join(root, "peer_review_count.circom"),
  "--r1cs", "--wasm", "--sym", "-o", buildDir, "-l", circomlib,
]);

const pot0 = path.join(buildDir, "pot12_0000.ptau");
const pot1 = path.join(buildDir, "pot12_0001.ptau");
const potFinal = path.join(buildDir, "pot12_final.ptau");
const zkey0 = path.join(buildDir, "peer_review_count_0000.zkey");
const zkeyFinal = path.join(buildDir, "peer_review_count_final.zkey");
const r1cs = path.join(buildDir, "peer_review_count.r1cs");
const entropy = randomBytes(32).toString("hex");

run(process.execPath, [snarkjsPath, "powersoftau", "new", "bn128", String(PTAU_POWER), pot0, "-v"]);
run(process.execPath, [
  snarkjsPath, "powersoftau", "contribute", pot0, pot1,
  "--name=sijil-peer-review-count-v1-dev", "-v", `-e=${entropy}`,
]);
run(process.execPath, [snarkjsPath, "powersoftau", "prepare", "phase2", pot1, potFinal, "-v"]);
run(process.execPath, [snarkjsPath, "groth16", "setup", r1cs, potFinal, zkey0]);
run(process.execPath, [
  snarkjsPath, "zkey", "contribute", zkey0, zkeyFinal,
  "--name=sijil-peer-review-count-v1-dev", "-v", `-e=${entropy}`,
]);
run(process.execPath, [
  snarkjsPath, "zkey", "export", "verificationkey", zkeyFinal,
  path.join(buildDir, "verification_key.json"),
]);

await rm(pot0, { force: true });
await rm(pot1, { force: true });
await rm(zkey0, { force: true });

await mkdir(outDir, { recursive: true });
const wasm = path.join(buildDir, "peer_review_count_js", "peer_review_count.wasm");
await copyFile(wasm, path.join(outDir, "peer_review_count.wasm"));
await copyFile(zkeyFinal, path.join(outDir, "peer_review_count_final.zkey"));
await copyFile(path.join(buildDir, "verification_key.json"), path.join(outDir, "verification_key.json"));

const hashes = {
  wasm: await sha256File(path.join(outDir, "peer_review_count.wasm")),
  zkey: await sha256File(path.join(outDir, "peer_review_count_final.zkey")),
  verificationKey: await sha256File(path.join(outDir, "verification_key.json")),
  setup: "development-only",
  circuit: "peer_review_count",
  circomVersion: CIRCOM_VERSION,
  circomPlatform: process.platform,
  snarkjs: "0.7.5",
  circomlib: "2.0.5",
  publicSignals: ["threshold", "commitment"],
  note: "Single-contributor development setup. Not production-secure.",
};
await writeFile(path.join(outDir, "hashes.json"), `${JSON.stringify(hashes, null, 2)}\n`);
console.log(JSON.stringify({
  wasm: hashes.wasm,
  zkey: hashes.zkey,
  verificationKey: hashes.verificationKey,
}, null, 2));
