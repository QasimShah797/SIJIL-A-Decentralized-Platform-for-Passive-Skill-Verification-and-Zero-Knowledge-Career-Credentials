import { describe, expect, it } from "vitest";
import { holderDidFromUserId } from "@/lib/did";
import {
  encodeDidKeyFromRawPublicKey,
  isDidKeyEd25519,
  isLegacyPlaceholderDid,
  resolveDidKey,
} from "@/lib/ssi/did-key";

describe("frontend did:key", () => {
  it("round-trips 32-byte Ed25519 public keys", () => {
    const raw = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
    const did = encodeDidKeyFromRawPublicKey(raw);
    const resolved = resolveDidKey(did);
    expect(resolved.did).toBe(did);
    expect(Array.from(resolved.publicKey)).toEqual(Array.from(raw));
    expect(isDidKeyEd25519(did)).toBe(true);
  });

  it("does not treat the UUID placeholder as a real did:key", () => {
    const placeholder = holderDidFromUserId("88226633-3715-44af-8202-ef6031e80164");
    expect(placeholder.startsWith("did:key:z6Mk")).toBe(true);
    expect(isDidKeyEd25519(placeholder)).toBe(false);
    expect(isLegacyPlaceholderDid(placeholder)).toBe(true);
  });
});
