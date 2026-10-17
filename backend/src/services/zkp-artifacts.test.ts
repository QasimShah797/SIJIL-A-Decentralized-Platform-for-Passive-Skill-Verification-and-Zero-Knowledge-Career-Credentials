/**
 * The verification-key digest is pinned in source. A matching manifest cannot replace it.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { PINNED_VERIFICATION_KEY_SHA256, resolveZkpArtifactDir } from "./zkp-artifacts";
import { readPinnedVerificationKey } from "./zkp-verify";
import { readPinnedArtifactHashes } from "./zkp-witness";

const previousArtifactDir = process.env.SIJIL_ZKP_ARTIFACT_DIR;

afterEach(() => {
  if (previousArtifactDir === undefined) delete process.env.SIJIL_ZKP_ARTIFACT_DIR;
  else process.env.SIJIL_ZKP_ARTIFACT_DIR = previousArtifactDir;
});

function trustedDir(): string {
  const dir = resolveZkpArtifactDir();
  if (!dir) throw new Error("score-threshold-v1 artifact bundle is missing");
  return dir;
}

function untrustedBundle(): string {
  const source = trustedDir();
  const dir = mkdtempSync(path.join(tmpdir(), "sijil-untrusted-vk-"));
  const key = JSON.parse(readFileSync(path.join(source, "verification_key.json"), "utf8")) as { protocol?: string };
  key.protocol = "untrusted";
  const keyBytes = Buffer.from(JSON.stringify(key));
  writeFileSync(path.join(dir, "verification_key.json"), keyBytes);
  const hashes = JSON.parse(readFileSync(path.join(source, "hashes.json"), "utf8")) as { verificationKey: string };
  hashes.verificationKey = createHash("sha256").update(keyBytes).digest("hex");
  writeFileSync(path.join(dir, "hashes.json"), JSON.stringify(hashes));
  writeFileSync(path.join(dir, "score_threshold.wasm"), readFileSync(path.join(source, "score_threshold.wasm")));
  writeFileSync(path.join(dir, "score_threshold_final.zkey"), readFileSync(path.join(source, "score_threshold_final.zkey")));
  return dir;
}

describe("independent verification-key pin", () => {
  it("accepts the verification key whose bytes match the source digest", () => {
    const pinned = readPinnedVerificationKey(trustedDir());
    assert.ok(pinned);
    assert.equal(pinned.sha256, PINNED_VERIFICATION_KEY_SHA256);
    assert.equal(pinned.pinnedSha256, PINNED_VERIFICATION_KEY_SHA256);
    const hashes = readPinnedArtifactHashes(path.join(trustedDir(), "hashes.json"));
    assert.equal(hashes?.verificationKey, PINNED_VERIFICATION_KEY_SHA256);
  });

  it("rejects a modified verification key", () => {
    const dir = untrustedBundle();
    try {
      assert.equal(readPinnedVerificationKey(dir), null);
      assert.equal(readPinnedArtifactHashes(path.join(dir, "hashes.json")), null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects a bundle whose verification key and manifest were replaced together", () => {
    const dir = untrustedBundle();
    try {
      const manifest = JSON.parse(readFileSync(path.join(dir, "hashes.json"), "utf8")) as { verificationKey: string };
      const fileHash = createHash("sha256").update(readFileSync(path.join(dir, "verification_key.json"))).digest("hex");
      assert.equal(fileHash, manifest.verificationKey);
      assert.notEqual(fileHash, PINNED_VERIFICATION_KEY_SHA256);
      assert.equal(readPinnedVerificationKey(dir), null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects an untrusted directory selected by SIJIL_ZKP_ARTIFACT_DIR", () => {
    const dir = untrustedBundle();
    const saved = process.env.SIJIL_ZKP_ARTIFACT_DIR;
    process.env.SIJIL_ZKP_ARTIFACT_DIR = dir;
    try {
      assert.equal(resolveZkpArtifactDir(), dir);
      assert.equal(readPinnedVerificationKey(), null);
    } finally {
      if (saved === undefined) delete process.env.SIJIL_ZKP_ARTIFACT_DIR;
      else process.env.SIJIL_ZKP_ARTIFACT_DIR = saved;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
