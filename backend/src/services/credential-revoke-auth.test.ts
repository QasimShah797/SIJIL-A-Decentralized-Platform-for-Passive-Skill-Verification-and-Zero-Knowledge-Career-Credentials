import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canRevokeIssuedCredential } from "./credential-revoke-auth";

const OWNER = "11111111-1111-4111-8111-111111111111";

describe("credential revocation authorization", () => {
  it("allows the holding learner and an administrator", () => {
    assert.equal(canRevokeIssuedCredential({ id: OWNER, roles: ["learner"] }, OWNER), true);
    assert.equal(canRevokeIssuedCredential({ id: "admin-id", roles: ["admin"] }, OWNER), true);
  });

  it("rejects reviewers, recruiters, and a different learner", () => {
    assert.equal(canRevokeIssuedCredential({ id: "reviewer-id", roles: ["reviewer"] }, OWNER), false);
    assert.equal(canRevokeIssuedCredential({ id: "recruiter-id", roles: ["recruiter"] }, OWNER), false);
    assert.equal(canRevokeIssuedCredential({ id: "other-learner", roles: ["learner"] }, OWNER), false);
  });
});
