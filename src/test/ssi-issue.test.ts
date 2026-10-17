import { describe, expect, it } from "vitest";
import { issueCredentialRequestBody } from "@/services/api/credentials.api";
import { holderDidFromUserId, isDidKeyEd25519, isLegacyPlaceholderDid } from "@/lib/did";

describe("SSI Phase 2 issuance client contract", () => {
  it("sends only skillId and never a DID or private key", () => {
    const body = issueCredentialRequestBody("32b45b94-a03b-4692-857f-9d28da0a706a");
    expect(Object.keys(body)).toEqual(["skillId"]);
    expect(body).not.toHaveProperty("did");
    expect(body).not.toHaveProperty("holderDid");
    expect(body).not.toHaveProperty("holder_did");
    expect(JSON.stringify(body)).not.toMatch(/private|jwk|pkcs8/i);
  });

  it("keeps historical placeholder DIDs distinguishable from real did:key", () => {
    const placeholder = holderDidFromUserId("88226633-3715-44af-8202-ef6031e80164");
    expect(isLegacyPlaceholderDid(placeholder)).toBe(true);
    expect(isDidKeyEd25519(placeholder)).toBe(false);
  });
});
