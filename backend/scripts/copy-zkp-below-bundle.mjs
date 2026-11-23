/**
 * Below-threshold ZKP bundle checks for copy-zkp-artifacts.mjs.
 * Exported for unit tests; production copy script imports these helpers only.
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

export const BELOW_ARTIFACT_ENTRIES = [
  ["score-threshold-v1-below", "score_below.wasm", "score_below_final.zkey"],
  ["github-contributions-v1-below", "github_contributions_below.wasm", "github_contributions_below_final.zkey"],
];

/**
 * @returns {{ status: "missing", folder: string, file: string }
 *   | { status: "mismatch", folder: string, file: string, expected: string, actual: string }
 *   | { status: "ready", folder: string, belowNames: [string, string][], belowHashes: object }}
 */
export function assessBelowBundle(belowSource, folder, wasmName, zkeyName) {
  const manifestPath = path.join(belowSource, "hashes.json");
  if (!existsSync(manifestPath)) {
    return { status: "missing", folder, file: "hashes.json" };
  }

  let belowHashes;
  try {
    belowHashes = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    return { status: "missing", folder, file: "hashes.json" };
  }

  const belowNames = [
    [wasmName, "wasm"],
    [zkeyName, "zkey"],
    ["verification_key.json", "verificationKey"],
  ];

  for (const [name, key] of belowNames) {
    const filePath = path.join(belowSource, name);
    if (!existsSync(filePath)) {
      return { status: "missing", folder, file: name };
    }
    const digest = createHash("sha256").update(readFileSync(filePath)).digest("hex");
    const expected = belowHashes[key];
    if (typeof expected !== "string" || digest !== expected) {
      return { status: "mismatch", folder, file: name, expected: expected ?? "", actual: digest };
    }
  }

  return { status: "ready", folder, belowNames, belowHashes };
}

export function clearBelowDestination(belowDestination) {
  if (existsSync(belowDestination)) {
    rmSync(belowDestination, { recursive: true, force: true });
  }
}

export function copyVerifiedBelowBundle(belowSource, belowDestination, belowNames) {
  rmSync(belowDestination, { recursive: true, force: true });
  mkdirSync(belowDestination, { recursive: true });
  for (const [name] of [...belowNames, ["hashes.json"]]) {
    copyFileSync(path.join(belowSource, name), path.join(belowDestination, name));
  }
}