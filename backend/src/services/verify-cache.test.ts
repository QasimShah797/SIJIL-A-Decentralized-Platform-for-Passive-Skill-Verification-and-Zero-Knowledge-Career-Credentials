import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeVerifyCache, shouldCacheVerifyResult, VERIFY_CACHE_TTL_MS, verifyCacheKey } from "./verify-cache";
import type { CredentialVerifyResult, CredentialVerifyStatus } from "./credential-verify";

describe("public verify cache", () => {
  it("returns a hit for the same credentialId and hash within the TTL", () => {
    const now = 1_000;
    const cache = makeVerifyCache<string>(VERIFY_CACHE_TTL_MS, () => now);
    cache.set("cred-1", "abc", "verified");
    assert.equal(cache.get("cred-1", "abc"), "verified");
    assert.equal(cache.get("cred-1", "other"), undefined);
    assert.equal(verifyCacheKey("cred-1", "abc"), "cred-1:abc");
  });

  it("expires entries after 5 minutes", () => {
    let now = 0;
    const cache = makeVerifyCache<string>(VERIFY_CACHE_TTL_MS, () => now);
    cache.set("cred-1", "abc", "verified");
    now = VERIFY_CACHE_TTL_MS - 1;
    assert.equal(cache.get("cred-1", "abc"), "verified");
    now = VERIFY_CACHE_TTL_MS;
    assert.equal(cache.get("cred-1", "abc"), undefined);
    assert.equal(cache.size(), 0);
  });

  it("invalidates every hash for a credential on revoke", () => {
    const cache = makeVerifyCache<string>();
    cache.set("cred-1", "abc", "verified");
    cache.set("cred-1", "def", "pending_anchor");
    cache.set("cred-2", "abc", "verified");
    cache.invalidateCredential("cred-1");
    assert.equal(cache.get("cred-1", "abc"), undefined);
    assert.equal(cache.get("cred-1", "def"), undefined);
    assert.equal(cache.get("cred-2", "abc"), "verified");
  });

  it("caches only terminal statuses", () => {
    const terminal: CredentialVerifyStatus[] = ["verified", "tampered", "revoked", "not_found"];
    const transient: CredentialVerifyStatus[] = [
      "evidence_unavailable",
      "ledger_unavailable",
      "pending_anchor",
    ];
    for (const status of terminal) {
      assert.equal(shouldCacheVerifyResult(status), true, status);
    }
    for (const status of transient) {
      assert.equal(shouldCacheVerifyResult(status), false, status);
    }
  });

  it("does not store transient results when rememberVerifyResult gates set", () => {
    const cache = makeVerifyCache<CredentialVerifyResult>();
    const base = {
      credentialId: "cred-1",
      hash: "abc",
      anchorTxId: null,
      anchoredAt: null,
      verifiedAt: "2026-10-01T00:00:00.000Z",
    };
    for (const status of ["evidence_unavailable", "ledger_unavailable", "pending_anchor"] as const) {
      rememberForTest(cache, "cred-1", "abc", { ...base, status });
      assert.equal(cache.get("cred-1", "abc"), undefined, status);
    }
    for (const status of ["verified", "tampered", "revoked", "not_found"] as const) {
      cache.clear();
      rememberForTest(cache, "cred-1", "abc", { ...base, status });
      assert.equal(cache.get("cred-1", "abc")?.status, status, status);
    }
  });
});

function rememberForTest(
  cache: ReturnType<typeof makeVerifyCache<CredentialVerifyResult>>,
  credentialId: string,
  hash: string,
  result: CredentialVerifyResult,
): void {
  if (!shouldCacheVerifyResult(result.status)) return;
  cache.set(credentialId, hash, result);
}
