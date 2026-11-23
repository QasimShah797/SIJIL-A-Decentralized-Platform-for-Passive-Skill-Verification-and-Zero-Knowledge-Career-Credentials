/**
 * Below-variant artifact pin integrity for github-contributions-v1.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  GITHUB_BELOW_ZKP_ARTIFACT_HASHES,
  resolveGitHubZkpArtifactDir,
} from "./github-zkp-artifacts";

const originalDir = process.env.SIJIL_GITHUB_ZKP_BELOW_ARTIFACT_DIR;
const temporaryDirs: string[] = [];

afterEach(() => {
  if (originalDir === undefined) {
    delete process.env.SIJIL_GITHUB_ZKP_BELOW_ARTIFACT_DIR;
  } else {
    process.env.SIJIL_GITHUB_ZKP_BELOW_ARTIFACT_DIR = originalDir;
  }
  for (const dir of temporaryDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function trustedBelowDir(): string {
  const dir = resolveGitHubZkpArtifactDir("below");
  assert.ok(dir, "Trusted GitHub below ZKP artifacts must exist");
  return dir;
}

describe("GitHub below ZKP pinned artifact integrity", () => {
  const published = path.resolve(__dirname, "../../../zkp-artifacts/github-contributions-v1-below");
  const originalKeyAvailable = Boolean(resolveGitHubZkpArtifactDir("below"));
  const keyMissing = originalKeyAvailable ? false : "Original pinned GitHub below proving key is unavailable";

  it("validates the checked-in WASM and verification key and refuses an incomplete bundle", () => {
    for (const [name, digest] of [
      ["github_contributions_below.wasm", GITHUB_BELOW_ZKP_ARTIFACT_HASHES.wasm],
      ["verification_key.json", GITHUB_BELOW_ZKP_ARTIFACT_HASHES.verificationKey],
    ]) {
      assert.equal(createHash("sha256").update(readFileSync(path.join(published, name))).digest("hex"), digest);
    }
    const dir = mkdtempSync(path.join(tmpdir(), "sijil-github-incomplete-"));
    temporaryDirs.push(dir);
    for (const name of ["github_contributions_below.wasm", "verification_key.json"]) {
      copyFileSync(path.join(published, name), path.join(dir, name));
    }
    process.env.SIJIL_GITHUB_ZKP_BELOW_ARTIFACT_DIR = dir;
    assert.notEqual(resolveGitHubZkpArtifactDir("below"), dir);
  });

  it("accepts authentic below artifacts", { skip: keyMissing }, () => {
    const dir = trustedBelowDir();
    assert.ok(dir);
    assert.equal(GITHUB_BELOW_ZKP_ARTIFACT_HASHES.verificationKey.length, 64);
  });

  it("rejects a modified below verification key", { skip: keyMissing }, () => {
    const source = trustedBelowDir();
    const dir = mkdtempSync(path.join(tmpdir(), "sijil-github-below-"));
    temporaryDirs.push(dir);
    for (const name of [
      "github_contributions_below.wasm",
      "github_contributions_below_final.zkey",
      "verification_key.json",
    ]) {
      copyFileSync(path.join(source, name), path.join(dir, name));
    }
    const keyPath = path.join(dir, "verification_key.json");
    writeFileSync(keyPath, Buffer.concat([readFileSync(keyPath), Buffer.from("x")]));
    process.env.SIJIL_GITHUB_ZKP_BELOW_ARTIFACT_DIR = dir;
    // Tampered env dir must not be selected; authentic fallback may still resolve.
    assert.notEqual(resolveGitHubZkpArtifactDir("below"), dir);
  });
});
