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

/**
 * SHA-256 of the score-threshold-v1 verification_key.json bytes.
 * This constant is the trust anchor. hashes.json and SIJIL_ZKP_ARTIFACT_DIR
 * cannot replace it.
 */
export const PINNED_VERIFICATION_KEY_SHA256 = "aff48cb87a787b102046765a05cd0515de3b753707cad93350a515539070b7e1";

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
