/**
 * Shared public score-threshold-v1 bundle.
 * Production prefers the copy inside the backend package, then the repository bundle.
 */
import { existsSync } from "node:fs";
import path from "node:path";

const REQUIRED = [
  "score_threshold.wasm",
  "score_threshold_final.zkey",
  "verification_key.json",
  "hashes.json",
];

export function resolveZkpArtifactDir(): string | null {
  const candidates = [
    process.env.SIJIL_ZKP_ARTIFACT_DIR,
    path.resolve(__dirname, "../../zkp-artifacts/score-threshold-v1"),
    path.resolve(__dirname, "../../../zkp-artifacts/score-threshold-v1"),
  ].filter((value): value is string => Boolean(value));
  for (const dir of candidates) {
    if (REQUIRED.every((name) => existsSync(path.join(dir, name)))) return dir;
  }
  return null;
}

export function commitmentModulePath(): string {
  return path.resolve(__dirname, "../zkp/commitment.mjs");
}
