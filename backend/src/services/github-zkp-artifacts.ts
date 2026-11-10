/**
 * GitHub Contributions ZKP artifact resolver (meets and below variants).
 * Uses independent, source-pinned SHA-256 hashes.
 * The current artifacts use a development-only trusted setup.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { CircuitVariant } from "./zkp-policy";

export const GITHUB_ZKP_ARTIFACT_HASHES = Object.freeze({
  wasm: "0332ae8aaac6c1699ce9fc627b8c95fb9104aed31621ac85556e721f1f7b9f97",
  zkey: "3103de335ab2695adc3df2b6b5a7965ad7d3080cd71be7207577b57473517d7a",
  verificationKey: "7f1f7d5ea7ddeb79743ebf85c1b98c9afcfdddbf9d70ee38cf57443f8035cf06",
});

/** Source-pinned digests for github-contributions-v1 below artifacts. */
export const GITHUB_BELOW_ZKP_ARTIFACT_HASHES = Object.freeze({
  wasm: "ec4688aeb5b5a7148a7f738617408fafe7e25260176e173c923f974a9d025de7",
  zkey: "391c2dda34c0ccc1a7570d25be2032b6a5e46d5a7cd72dc725d1fbb008cb1875",
  verificationKey: "1eb098a12738e8cd6426fda605e17138b5938e78af5b2ba870ea50a1e553dca0",
});

const MEETS_REQUIRED = [
  ["github_contributions.wasm", GITHUB_ZKP_ARTIFACT_HASHES.wasm],
  ["github_contributions_final.zkey", GITHUB_ZKP_ARTIFACT_HASHES.zkey],
  ["verification_key.json", GITHUB_ZKP_ARTIFACT_HASHES.verificationKey],
] as const;

const BELOW_REQUIRED = [
  ["github_contributions_below.wasm", GITHUB_BELOW_ZKP_ARTIFACT_HASHES.wasm],
  ["github_contributions_below_final.zkey", GITHUB_BELOW_ZKP_ARTIFACT_HASHES.zkey],
  ["verification_key.json", GITHUB_BELOW_ZKP_ARTIFACT_HASHES.verificationKey],
] as const;

function matchesPinnedHash(file: string, expected: string): boolean {
  try {
    const actual = createHash("sha256")
      .update(readFileSync(file))
      .digest("hex");
    return actual === expected;
  } catch {
    return false;
  }
}

function candidateRoots(variant: CircuitVariant): string[] {
  const folder = variant === "below" ? "github-contributions-v1-below" : "github-contributions-v1";
  const envKey = variant === "below"
    ? process.env.SIJIL_GITHUB_ZKP_BELOW_ARTIFACT_DIR
    : process.env.SIJIL_GITHUB_ZKP_ARTIFACT_DIR;
  return [
    envKey,
    path.resolve(__dirname, `../../zkp-artifacts/${folder}`),
    path.resolve(__dirname, `../../../zkp-artifacts/${folder}`),
  ].filter((value): value is string => Boolean(value));
}

export function resolveGitHubZkpArtifactDir(variant: CircuitVariant = "meets"): string | null {
  const required = variant === "below" ? BELOW_REQUIRED : MEETS_REQUIRED;
  for (const dir of candidateRoots(variant)) {
    if (
      required.every(
        ([name, hash]) =>
          existsSync(path.join(dir, name)) &&
          matchesPinnedHash(path.join(dir, name), hash),
      )
    ) {
      return dir;
    }
  }
  return null;
}

export function githubArtifactFilenames(variant: CircuitVariant): {
  wasm: string;
  zkey: string;
  verificationKey: string;
} {
  if (variant === "below") {
    return {
      wasm: "github_contributions_below.wasm",
      zkey: "github_contributions_below_final.zkey",
      verificationKey: "verification_key.json",
    };
  }
  return {
    wasm: "github_contributions.wasm",
    zkey: "github_contributions_final.zkey",
    verificationKey: "verification_key.json",
  };
}

export function pinnedGitHubArtifactHashes(variant: CircuitVariant) {
  return variant === "below" ? GITHUB_BELOW_ZKP_ARTIFACT_HASHES : GITHUB_ZKP_ARTIFACT_HASHES;
}

export function githubCommitmentModulePath(): string {
  const candidates = [
    path.resolve(__dirname, "../zkp/github-contribution-commitment.mjs"),
    path.resolve(__dirname, "../../dist/zkp/github-contribution-commitment.mjs"),
    path.resolve(__dirname, "../../../circuits/github-contributions-v1/src/commitment.mjs"),
  ];

  const modulePath = candidates.find((candidate) => existsSync(candidate));

  if (!modulePath) {
    throw new Error("GitHub commitment helper is unavailable; run npm run build");
  }

  return modulePath;
}
