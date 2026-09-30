import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeVerifyCache, VERIFY_CACHE_TTL_MS, verifyCacheKey } from "./verify-cache";

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
});
