import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { recruiterVerifyCredential } from "./recruiter-verify";
import type { CredentialVerifyResult } from "./credential-verify";

function verifyResult(status: CredentialVerifyResult["status"], credentialId: string): CredentialVerifyResult {
  return {
    status,
    credentialId,
    hash: "abc",
    anchorTxId: "tx",
    anchoredAt: "2026-10-01T00:00:00.000Z",
    verifiedAt: "2026-10-01T00:00:00.000Z",
  };
}

describe("recruiter verify delegates to public verification", () => {
  it("returns identical statuses for the same credential id", async () => {
    const publicVerify = async (id: string) => verifyResult("verified", id);
    const publicResult = await publicVerify("urn:uuid:sijil:cred");
    const recruiterResult = await recruiterVerifyCredential("urn:uuid:sijil:cred", {
      lookupPresentation: async () => null,
      verify: publicVerify,
    });
    assert.equal(recruiterResult.status, publicResult.status);
    assert.deepEqual(recruiterResult, publicResult);
  });

  it("resolves a presentation token then returns the same status as public verify", async () => {
    const publicVerify = async (id: string) => verifyResult("tampered", id);
    const publicResult = await publicVerify("cred-db-id");
    const recruiterResult = await recruiterVerifyCredential("presentation-token", {
      lookupPresentation: async (token) => (token === "presentation-token" ? "cred-db-id" : null),
      verify: publicVerify,
    });
    assert.equal(recruiterResult.status, publicResult.status);
    assert.equal(recruiterResult.credentialId, publicResult.credentialId);
  });
});
