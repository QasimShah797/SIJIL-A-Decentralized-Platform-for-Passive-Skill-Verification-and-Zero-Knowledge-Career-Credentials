import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  GITHUB_ZKP_ARTIFACT_HASHES,
  resolveGitHubZkpArtifactDir,
} from "./github-zkp-artifacts";

const originalDir = process.env.SIJIL_GITHUB_ZKP_ARTIFACT_DIR;
const temporaryDirs: string[] = [];

afterEach(() => {
  if (originalDir === undefined) {
    delete process.env.SIJIL_GITHUB_ZKP_ARTIFACT_DIR;
  } else {
    process.env.SIJIL_GITHUB_ZKP_ARTIFACT_DIR = originalDir;
  }

  for (const dir of temporaryDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function trustedDir(): string {
  const dir = resolveGitHubZkpArtifactDir();
  assert.ok(dir, "Trusted GitHub ZKP artifacts must exist");
  return dir;
}

function temporaryBundle(): string {
  const source = trustedDir();
  const dir = mkdtempSync(path.join(tmpdir(), "sijil-github-zkp-"));
  temporaryDirs.push(dir);

  for (const name of [
    "github_contributions.wasm",
    "github_contributions_final.zkey",
    "verification_key.json",
    "hashes.json",
  ]) {
    copyFileSync(path.join(source, name), path.join(dir, name));
  }

  return dir;
}

describe("GitHub ZKP pinned artifact integrity", () => {
  it("accepts authentic artifacts", () => {
    const dir = trustedDir();
    assert.ok(dir);
    assert.equal(GITHUB_ZKP_ARTIFACT_HASHES.verificationKey.length, 64);
  });

  it("accepts an authentic bundle from an explicit directory", () => {
    const dir = temporaryBundle();
    process.env.SIJIL_GITHUB_ZKP_ARTIFACT_DIR = dir;
    assert.equal(resolveGitHubZkpArtifactDir(), dir);
  });

  for (const name of [
    "verification_key.json",
    "github_contributions.wasm",
    "github_contributions_final.zkey",
  ]) {
    it(`rejects a modified ${name} in an isolated bundle`, () => {
      const dir = temporaryBundle();
      const file = path.join(dir, name);
      const original = readFileSync(file);
      writeFileSync(file, Buffer.concat([original, Buffer.from("tampered")]));
      process.env.SIJIL_GITHUB_ZKP_ARTIFACT_DIR = dir;
      assert.notEqual(resolveGitHubZkpArtifactDir(), dir);
    });
  }

  it("rejects a missing verification key in an isolated bundle", () => {
    const dir = temporaryBundle();
    rmSync(path.join(dir, "verification_key.json"));
    process.env.SIJIL_GITHUB_ZKP_ARTIFACT_DIR = dir;
    assert.notEqual(resolveGitHubZkpArtifactDir(), dir);
  });

  it("does not trust a replaced verification key and manifest", () => {
    const dir = temporaryBundle();
    const keyPath = path.join(dir, "verification_key.json");
    const key = JSON.parse(readFileSync(keyPath, "utf8"));
    key.protocol = "untrusted";
    writeFileSync(keyPath, JSON.stringify(key));

    const manifestPath = path.join(dir, "hashes.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.verificationKey = "0".repeat(64);
    writeFileSync(manifestPath, JSON.stringify(manifest));

    process.env.SIJIL_GITHUB_ZKP_ARTIFACT_DIR = dir;
    assert.notEqual(resolveGitHubZkpArtifactDir(), dir);
  });
});
