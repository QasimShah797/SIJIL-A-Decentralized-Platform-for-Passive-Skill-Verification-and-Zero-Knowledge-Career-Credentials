import { describe, expect, it } from "vitest";
import {
  activateLocalIdentity,
  bindRequestBody,
  deriveSsiStatus,
  ownershipSignPayload,
} from "@/lib/ssi/ownership";
import { encodeDidKeyFromRawPublicKey } from "@/lib/ssi/did-key";
import { MemorySsiKeyStore, type StoredSsiIdentity } from "@/lib/ssi/keystore";
import type { SsiSupportResult } from "@/lib/ssi/support";

const realDid = encodeDidKeyFromRawPublicKey(Uint8Array.from({ length: 32 }, (_, index) => index + 1));

const okSupport: SsiSupportResult = {
  webCrypto: true,
  ed25519: true,
  indexedDb: true,
  nonExtractablePersist: true,
  ok: true,
  reasons: [],
};

const unsupported: SsiSupportResult = {
  webCrypto: true,
  ed25519: false,
  indexedDb: true,
  nonExtractablePersist: false,
  ok: false,
  reasons: ["Ed25519 in Web Crypto is not available"],
};

function fakeKey(extractable = false): CryptoKey {
  return { type: "private", extractable, algorithm: { name: "Ed25519" } } as CryptoKey;
}

describe("SSI ownership helpers", () => {
  it("never includes private key fields in the bind body", () => {
    const body = bindRequestBody({
      challengeId: "11111111-2222-4333-8444-555555555555",
      did: realDid,
      signature: "abc",
    });
    expect(Object.keys(body).sort()).toEqual(["challengeId", "did", "signature"]);
    expect(body).not.toHaveProperty("fingerprint");
    expect(body).not.toHaveProperty("public_key_multibase");
    expect(body).not.toHaveProperty("publicKeyMultibase");
    expect(JSON.stringify(body)).not.toMatch(/private|jwk|pkcs8/i);
  });

  it("binds the DID into the signed payload", () => {
    expect(ownershipSignPayload("challenge", "did:key:z6Mkabc")).toBe("challenge\ndid=did:key:z6Mkabc");
  });

  it("maps support and key states without regenerating", () => {
    expect(deriveSsiStatus({ support: unsupported, local: null, serverDid: null }).status).toBe("unsupported");
    expect(deriveSsiStatus({ support: okSupport, local: null, serverDid: null }).status).toBe("not_activated");
    expect(deriveSsiStatus({
      support: okSupport,
      local: null,
      serverDid: realDid,
    }).status).toBe("key_unavailable");
  });

  it("refuses to mint a new DID when a server DID exists or the stored key is dead", async () => {
    const store = new MemorySsiKeyStore();
    await expect(activateLocalIdentity(
      "user-1",
      store,
      null,
      realDid,
    )).rejects.toThrow(/already registered/);

    const dead: StoredSsiIdentity = {
      userId: "user-1",
      did: "did:key:z6Mkdead",
      fingerprint: "aa:bb",
      createdAt: new Date().toISOString(),
      privateKey: fakeKey(true),
    };
    await expect(activateLocalIdentity("user-1", store, dead, null)).rejects.toThrow(/unusable/);
  });
});
