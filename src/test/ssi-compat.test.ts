import { describe, expect, it } from "vitest";
import { holderDidFromUserId, isDidKeyEd25519, isLegacyPlaceholderDid } from "@/lib/did";
import { isBlockchainVerified } from "@/lib/share-trust";

describe("SSI Phase 1 credential compatibility", () => {
  it("keeps existing holder DIDs as non-cryptographic placeholders", () => {
    const holderDid = holderDidFromUserId("88226633-3715-44af-8202-ef6031e80164");
    expect(isLegacyPlaceholderDid(holderDid)).toBe(true);
    expect(isDidKeyEd25519(holderDid)).toBe(false);
  });

  it("does not treat issuer ledger verified as DID-bound", () => {
    expect(isBlockchainVerified("verified")).toBe(true);
    expect(isBlockchainVerified("verified", "legacy_unverified_evidence")).toBe(false);
  });
});
