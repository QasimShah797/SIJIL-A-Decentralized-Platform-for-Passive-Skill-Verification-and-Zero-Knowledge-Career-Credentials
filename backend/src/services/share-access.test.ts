import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { payloadVisibleToRecipient, shareLinkAccess } from "./share-access";

const payload = {
  competency: { name: "TypeScript" },
  learner: { contact: { email: "learner@example.edu" } },
};

describe("share link recipient access", () => {
  it("hides the stored payload when the link is expired or revoked", () => {
    assert.equal(shareLinkAccess({
      revoked: false,
      expiresAt: "2020-01-01T00:00:00.000Z",
      now: Date.parse("2026-01-01T00:00:00.000Z"),
    }), "expired");
    assert.deepEqual(payloadVisibleToRecipient("expired", payload), {});
    assert.equal(shareLinkAccess({ revoked: true, expiresAt: "2027-01-01T00:00:00.000Z" }), "revoked");
    assert.deepEqual(payloadVisibleToRecipient("revoked", payload), {});
    assert.equal(JSON.stringify(payloadVisibleToRecipient("expired", payload)).includes("learner@example.edu"), false);
  });

  it("returns the stored payload only while the link is active", () => {
    assert.equal(shareLinkAccess({
      revoked: false,
      expiresAt: "2027-01-01T00:00:00.000Z",
      now: Date.parse("2026-01-01T00:00:00.000Z"),
    }), "active");
    assert.deepEqual(payloadVisibleToRecipient("active", payload), payload);
  });
});
