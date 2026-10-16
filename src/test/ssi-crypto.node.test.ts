/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { generateLearnerKeyPair, identityFromKeyPair, MemorySsiKeyStore } from "@/lib/ssi/keystore";
import { encodeDidKeyFromRawPublicKey, resolveDidKey } from "@/lib/ssi/did-key";
import { activateLocalIdentity, signOwnershipProof } from "@/lib/ssi/ownership";

const ed25519Available = typeof crypto !== "undefined"
  && Boolean(crypto.subtle)
  && typeof crypto.subtle.generateKey === "function";

describe.skipIf(!ed25519Available)("learner Ed25519 key generation", () => {
  it("creates a non-extractable key and a real did:key", async () => {
    const pair = await generateLearnerKeyPair();
    expect(pair.privateKey.extractable).toBe(false);
    expect(pair.privateKey.type).toBe("private");
    const record = await identityFromKeyPair("user-1", pair);
    expect(resolveDidKey(record.did).did).toBe(record.did);
    const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
    expect(record.did).toBe(encodeDidKeyFromRawPublicKey(raw));
  });

  it("reuses an existing usable key instead of generating another DID", async () => {
    const store = new MemorySsiKeyStore();
    const first = await identityFromKeyPair("user-1", await generateLearnerKeyPair());
    await store.save(first);
    const second = await activateLocalIdentity("user-1", store, first, null);
    expect(second.did).toBe(first.did);
  });

  it("signs an ownership payload with the non-extractable key", async () => {
    const record = await identityFromKeyPair("user-1", await generateLearnerKeyPair());
    const signature = await signOwnershipProof(record, "SIJIL-SSI-BIND-v1\nuserId=user-1");
    expect(signature).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(JSON.stringify(record)).not.toMatch(/BEGIN PRIVATE KEY/);
  });
});
