/**
 * Shared public score-threshold-v1 bundle (meets and below variants).
 * Production prefers the copy inside the backend package, then the repository bundle.
 * Source-pinned SHA-256 digests are the trust anchor; hashes.json cannot replace them.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { CircuitVariant } from "./zkp-policy";

/**
 * SHA-256 of the score-threshold-v1 (meets) verification_key.json bytes.
 * This constant is the trust anchor. hashes.json and SIJIL_ZKP_ARTIFACT_DIR
 * cannot replace it.
 */
export const PINNED_VERIFICATION_KEY_SHA256 = "aff48cb87a787b102046765a05cd0515de3b753707cad93350a515539070b7e1";

/** Source-pinned digests for score-threshold-v1 meets artifacts. */
export const SCORE_MEETS_ZKP_ARTIFACT_HASHES = Object.freeze({
  wasm: "aa87825cd7848d8392247d470709cf4f74c33877a48075882b5bcba8b7c7f6b8",
  zkey: "dc4b128541eac571589effd8eb183ed755ca0333ba0f5d9fdc4a7f4da08ebbdb",
  verificationKey: PINNED_VERIFICATION_KEY_SHA256,
});

/** Source-pinned digests for score-threshold-v1 below artifacts. */
export const SCORE_BELOW_ZKP_ARTIFACT_HASHES = Object.freeze({
  wasm: "61cddfcb0b2ba1eb63279e1404bdc6cfeb9c9131a28e742f8bc6bed03583441a",
  zkey: "d3555e1be79e462cd24183544978bd0d799ec2a35f4689cc2c92b8a8cb61c89c",
  verificationKey: "8e609ca611123e33f34500c120c0f799e726d95a3351c887f5c819311c6caf76",
});

const BELOW_REQUIRED = [
  ["score_below.wasm", SCORE_BELOW_ZKP_ARTIFACT_HASHES.wasm],
  ["score_below_final.zkey", SCORE_BELOW_ZKP_ARTIFACT_HASHES.zkey],
  ["verification_key.json", SCORE_BELOW_ZKP_ARTIFACT_HASHES.verificationKey],
] as const;

function matchesPinnedHash(file: string, expected: string): boolean {
  try {
    const actual = createHash("sha256").update(readFileSync(file)).digest("hex");
    return actual === expected;
  } catch {
    return false;
  }
}

function candidateRoots(variant: CircuitVariant): string[] {
  const folder = variant === "below" ? "score-threshold-v1-below" : "score-threshold-v1";
  const envKey = variant === "below"
    ? process.env.SIJIL_ZKP_BELOW_ARTIFACT_DIR
    : process.env.SIJIL_ZKP_ARTIFACT_DIR;
  return [
    envKey,
    path.resolve(__dirname, `../../zkp-artifacts/${folder}`),
    path.resolve(__dirname, `../../../zkp-artifacts/${folder}`),
  ].filter((value): value is string => Boolean(value));
}

/**
 * Resolve the score-threshold artifact directory for a circuit variant.
 * Defaults to meets for backward compatibility with browser-proved paths.
 * Meets: file presence only (VK pin enforced at verify time via PINNED_VERIFICATION_KEY_SHA256).
 * Below: source-pinned SHA-256 digests required for wasm/zkey/VK.
 */
export function resolveZkpArtifactDir(variant: CircuitVariant = "meets"): string | null {
  if (variant === "below") {
    for (const dir of candidateRoots("below")) {
      if (
        BELOW_REQUIRED.every(
          ([name, hash]) =>
            existsSync(path.join(dir, name)) && matchesPinnedHash(path.join(dir, name), hash),
        )
        && existsSync(path.join(dir, "hashes.json"))
      ) {
        return dir;
      }
    }
    return null;
  }

  const meetsFiles = [
    "score_threshold.wasm",
    "score_threshold_final.zkey",
    "verification_key.json",
    "hashes.json",
  ];
  for (const dir of candidateRoots("meets")) {
    if (meetsFiles.every((name) => existsSync(path.join(dir, name)))) return dir;
  }
  return null;
}

export function scoreArtifactFilenames(variant: CircuitVariant): {
  wasm: string;
  zkey: string;
  verificationKey: string;
} {
  if (variant === "below") {
    return {
      wasm: "score_below.wasm",
      zkey: "score_below_final.zkey",
      verificationKey: "verification_key.json",
    };
  }
  return {
    wasm: "score_threshold.wasm",
    zkey: "score_threshold_final.zkey",
    verificationKey: "verification_key.json",
  };
}

export function pinnedScoreArtifactHashes(variant: CircuitVariant) {
  return variant === "below" ? SCORE_BELOW_ZKP_ARTIFACT_HASHES : SCORE_MEETS_ZKP_ARTIFACT_HASHES;
}

export function commitmentModulePath(): string {
  return path.resolve(__dirname, "../zkp/commitment.mjs");
}
