import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { credentialFromDisclosedFields } from "./recruiter-disclose";

describe("recruiter disclosed-field projection", () => {
  it("omits undisclosed credential fields", () => {
    const view = credentialFromDisclosedFields(
      [
        { id: "skill", label: "Skill", value: "TypeScript" },
        { id: "issuer", label: "Issuer", value: "CUST" },
      ],
      { id: "urn:uuid:sijil:shared" },
    );
    assert.equal(view.id, "urn:uuid:sijil:shared");
    assert.equal(view.skill, "TypeScript");
    assert.equal(view.issuer, "CUST");
    assert.equal(view.holderDid, undefined);
    assert.equal(view.validFrom, undefined);
    assert.equal(view.proof, undefined);
  });
});
