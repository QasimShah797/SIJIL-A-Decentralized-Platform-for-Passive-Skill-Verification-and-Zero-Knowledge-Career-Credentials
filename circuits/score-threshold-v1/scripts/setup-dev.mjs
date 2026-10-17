/**
 * Development-only Groth16 setup for score-threshold-v1.
 *
 * Downloads pinned Circom 2.1.9, compiles the circuit against circomlib 2.0.5,
 * and builds a local powers-of-tau plus a single Groth16 contribution.
 * Contribution entropy is random and is not written to disk. This is not a
 * multi-party ceremony and must not be described as production setup.
 */
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = path.join(root, "build");
const toolsDir = path.join(root, ".tools");
const circomPath = path.join(toolsDir, "circom");
const snarkjsPath = path.join(root, "node_modules", "snarkjs", "build", "cli.cjs");

const CIRCOM_VERSION = "2.1.9";
const CIRCOM_URL = `https://github.com/iden3/circom/releases/download/v${CIRCOM_VERSION}/circom-linux-amd64`;
// SHA-256 of the official v2.1.9 linux-amd64 release asset.
const CIRCOM_SHA256 = "e5575829252d763b7818049df9de2ef9304df834697de77fa63ce7babc23c967";
const PTAU_POWER = 12;

function redact(args) {
  return args.map((arg) => {
    if (arg.startsWith("-e=") || arg.startsWith("--entropy=")) {
      return `${arg.slice(0, arg.indexOf("="))}=<redacted>`;
    }
    return arg;
  }).join(" ");
}

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`command failed (${result.status}): ${command} ${redact(args)}`);
  }
}

async function sha256File(file) {
  const bytes = await readFile(file);
  return createHash("sha256").update(bytes).digest("hex");
}

async function ensureCircom() {
  await mkdir(toolsDir, { recursive: true });
  try {
    const current = await sha256File(circomPath);
    if (current === CIRCOM_SHA256) {
      return circomPath;
    }
  } catch {
    // Download below.
  }

  console.log(`[setup] downloading Circom ${CIRCOM_VERSION}`);
  const response = await fetch(CIRCOM_URL);
  if (!response.ok) {
    throw new Error(`Circom download failed: ${response.status} ${response.statusText}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== CIRCOM_SHA256) {
    throw new Error(`Circom checksum mismatch: ${digest}`);
  }
  await writeFile(circomPath, bytes);
  await chmod(circomPath, 0o755);
  return circomPath;
}

function entropy() {
  return randomBytes(32).toString("hex");
}

async function compile(circom) {
  await mkdir(buildDir, { recursive: true });
  run(circom, [
    path.join(root, "score_threshold.circom"),
    "--r1cs",
    "--wasm",
    "--sym",
    "-o",
    buildDir,
    "-l",
    path.join(root, "node_modules", "circomlib", "circuits"),
  ]);
}

async function setupKeys() {
  const pot0000 = path.join(buildDir, "pot12_0000.ptau");
  const pot0001 = path.join(buildDir, "pot12_0001.ptau");
  const potFinal = path.join(buildDir, "pot12_final.ptau");
  const zkey0000 = path.join(buildDir, "score_threshold_0000.zkey");
  const zkeyFinal = path.join(buildDir, "score_threshold_final.zkey");
  const zkeyWrong = path.join(buildDir, "score_threshold_wrong.zkey");
  const r1cs = path.join(buildDir, "score_threshold.r1cs");

  if (process.platform !== "linux" || process.arch !== "x64") {
    throw new Error("This setup pins the linux-amd64 Circom binary. Install Circom 2.1.9 for this platform and rerun.");
  }

  run(process.execPath, [snarkjsPath, "powersoftau", "new", "bn128", String(PTAU_POWER), pot0000, "-v"]);
  run(process.execPath, [
    snarkjsPath, "powersoftau", "contribute", pot0000, pot0001,
    "--name=sijil-score-threshold-v1-dev",
    "-v",
    `-e=${entropy()}`,
  ]);
  run(process.execPath, [snarkjsPath, "powersoftau", "prepare", "phase2", pot0001, potFinal, "-v"]);
  run(process.execPath, [snarkjsPath, "groth16", "setup", r1cs, potFinal, zkey0000]);
  run(process.execPath, [
    snarkjsPath, "zkey", "contribute", zkey0000, zkeyFinal,
    "--name=sijil-score-threshold-v1-dev",
    "-v",
    `-e=${entropy()}`,
  ]);
  run(process.execPath, [
    snarkjsPath, "zkey", "contribute", zkey0000, zkeyWrong,
    "--name=sijil-score-threshold-v1-wrong-key",
    "-v",
    `-e=${entropy()}`,
  ]);
  run(process.execPath, [
    snarkjsPath, "zkey", "export", "verificationkey", zkeyFinal,
    path.join(buildDir, "verification_key.json"),
  ]);
  run(process.execPath, [
    snarkjsPath, "zkey", "export", "verificationkey", zkeyWrong,
    path.join(buildDir, "verification_key_wrong.json"),
  ]);

  await rm(pot0000, { force: true });
  await rm(pot0001, { force: true });
  await rm(zkey0000, { force: true });
}

async function writeHashes() {
  const files = {
    circuit: path.join(root, "score_threshold.circom"),
    r1cs: path.join(buildDir, "score_threshold.r1cs"),
    wasm: path.join(buildDir, "score_threshold_js", "score_threshold.wasm"),
    zkey: path.join(buildDir, "score_threshold_final.zkey"),
    verificationKey: path.join(buildDir, "verification_key.json"),
    wrongVerificationKey: path.join(buildDir, "verification_key_wrong.json"),
  };
  const hashes = {};
  for (const [name, file] of Object.entries(files)) {
    hashes[name] = await sha256File(file);
  }
  hashes.circomVersion = CIRCOM_VERSION;
  hashes.circomSha256 = CIRCOM_SHA256;
  hashes.snarkjs = "0.7.5";
  hashes.circomlib = "2.0.5";
  hashes.circomlibjs = "0.1.7";
  hashes.curve = "bn128";
  hashes.ptauPower = PTAU_POWER;
  hashes.publicSignals = ["threshold", "commitment"];
  await writeFile(path.join(buildDir, "hashes.json"), `${JSON.stringify(hashes, null, 2)}\n`);
  console.log("[setup] hashes");
  console.log(JSON.stringify(hashes, null, 2));
}

async function artifactsReady() {
  const required = [
    path.join(buildDir, "score_threshold.r1cs"),
    path.join(buildDir, "score_threshold_js", "score_threshold.wasm"),
    path.join(buildDir, "score_threshold_final.zkey"),
    path.join(buildDir, "verification_key.json"),
    path.join(buildDir, "verification_key_wrong.json"),
  ];
  try {
    await Promise.all(required.map((file) => readFile(file)));
    return true;
  } catch {
    return false;
  }
}

const force = process.argv.includes("--force");
if (!force && await artifactsReady()) {
  console.log("[setup] artifacts already present, skipping. Pass --force to rebuild.");
} else {
  const circom = await ensureCircom();
  await compile(circom);
  await setupKeys();
}
await writeHashes();
