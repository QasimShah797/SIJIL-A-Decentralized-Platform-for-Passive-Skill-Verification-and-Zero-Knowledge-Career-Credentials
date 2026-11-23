/**
 * Resolves moodle-completion-v1 public proving artifacts.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const CIRCUIT_ID = "moodle-completion-v1";

const CANDIDATE_DIRS = [
  path.resolve(__dirname, "../../zkp-artifacts", CIRCUIT_ID),
  path.resolve(__dirname, "../../../zkp-artifacts", CIRCUIT_ID),
];

export const MOODLE_ARTIFACT_FILES = {
  wasm: "moodle_completion.wasm",
  zkey: "moodle_completion_final.zkey",
  verificationKey: "verification_key.json",
  hashes: "hashes.json",
} as const;

export function resolveMoodleZkpArtifactDir(): string | null {
  for (const dir of CANDIDATE_DIRS) {
    const wasm = path.join(dir, MOODLE_ARTIFACT_FILES.wasm);
    const zkey = path.join(dir, MOODLE_ARTIFACT_FILES.zkey);
    const vk = path.join(dir, MOODLE_ARTIFACT_FILES.verificationKey);
    const hashesPath = path.join(dir, MOODLE_ARTIFACT_FILES.hashes);
    if (!existsSync(wasm) || !existsSync(zkey) || !existsSync(vk) || !existsSync(hashesPath)) {
      continue;
    }
    try {
      const hashes = JSON.parse(readFileSync(hashesPath, "utf8")) as Record<string, string>;
      const checks: Array<[string, string]> = [
        [wasm, hashes.wasm],
        [zkey, hashes.zkey],
        [vk, hashes.verificationKey],
      ];
      for (const [file, expected] of checks) {
        if (!expected) return null;
        const digest = createHash("sha256").update(readFileSync(file)).digest("hex");
        if (digest !== expected) return null;
      }
      return dir;
    } catch {
      return null;
    }
  }
  return null;
}

export function moodleCommitmentModulePath(): string {
  return path.resolve(
    __dirname,
    "../../../circuits/moodle-completion-v1/src/commitment.mjs",
  );
}
