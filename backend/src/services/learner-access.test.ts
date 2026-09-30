import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canReadLearnerData, isActiveShareRow } from "./learner-access";

const learnerA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const learnerB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const recruiter = "cccccccc-cccc-cccc-cccc-cccccccccccc";

describe("learner read scoping", () => {
  it("allows a learner to read their own wallet", () => {
    assert.equal(
      canReadLearnerData({
        caller: { id: learnerA, roles: ["learner"] },
        ownerId: learnerA,
        hasActiveShare: false,
      }),
      true,
    );
  });

  it("does not allow learner A to read learner B's wallet", () => {
    assert.equal(
      canReadLearnerData({
        caller: { id: learnerA, roles: ["learner"] },
        ownerId: learnerB,
        hasActiveShare: false,
      }),
      false,
    );
  });

  it("allows a recruiter only when the learner has an active share", () => {
    assert.equal(
      canReadLearnerData({
        caller: { id: recruiter, roles: ["recruiter"] },
        ownerId: learnerA,
        hasActiveShare: false,
      }),
      false,
    );
    assert.equal(
      canReadLearnerData({
        caller: { id: recruiter, roles: ["recruiter"] },
        ownerId: learnerA,
        hasActiveShare: true,
      }),
      true,
    );
  });

  it("treats revoked or expired shares as inactive", () => {
    const now = new Date("2026-10-01T00:00:00.000Z");
    assert.equal(isActiveShareRow({ revoked: true, now }), false);
    assert.equal(isActiveShareRow({ revokedAt: now.toISOString(), now }), false);
    assert.equal(isActiveShareRow({ expiresAt: "2026-09-01T00:00:00.000Z", now }), false);
    assert.equal(isActiveShareRow({ expiresAt: "2026-12-01T00:00:00.000Z", now }), true);
  });
});
