import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  annotateSkillTrust,
  canCreateIssuedOnlyShare,
  isBlockchainVerified,
  resumeImpliesAllSkillsVerified,
  siblingIdsForShareScope,
  skillTrustLabel,
} from "./share-trust";

const typescriptId = "32b45b94-a03b-4692-857f-9d28da0a706a";
const javascriptId = "8b4ea14a-fef4-41da-b043-e73ca1e3c196";

describe("share trust labels", () => {
  it("never treats an unissued skill as blockchain verified", () => {
    const trust = annotateSkillTrust({
      issued: false,
      ledgerStatus: "verified",
    });
    assert.equal(trust.issued, false);
    assert.equal(trust.blockchainVerified, false);
    assert.equal(trust.ledgerStatus, "not_found");
    assert.equal(trust.trustLabel, "Not verified / No issued credential");
    assert.equal(isBlockchainVerified("verified"), true);
    assert.equal(isBlockchainVerified("ledger_unavailable"), false);
  });

  it("requires verified ledger status for TypeScript-style issued credentials", () => {
    const verified = annotateSkillTrust({
      issued: true,
      credentialId: "e5d7e2bb-06f9-40ef-80f7-0310f6aa21b3",
      ledgerStatus: "verified",
    });
    assert.equal(verified.blockchainVerified, true);
    assert.equal(verified.trustLabel, "Blockchain verified");

    const unavailable = annotateSkillTrust({
      issued: true,
      credentialId: "e5d7e2bb-06f9-40ef-80f7-0310f6aa21b3",
      ledgerStatus: "ledger_unavailable",
    });
    assert.equal(unavailable.blockchainVerified, false);
    assert.equal(unavailable.trustLabel, "Issued · ledger unavailable");
    assert.equal(skillTrustLabel({ issued: true, ledgerStatus: "pending_anchor" }), "Issued · pending blockchain anchor");
  });

  it("keeps all-scope siblings but issued-only scope drops unissued JavaScript", () => {
    const allIds = [typescriptId, javascriptId];
    const issued = new Set([typescriptId]);
    assert.deepEqual(
      siblingIdsForShareScope("all", typescriptId, allIds, issued),
      [javascriptId],
    );
    assert.deepEqual(
      siblingIdsForShareScope("issued", typescriptId, allIds, issued),
      [],
    );
    assert.deepEqual(
      siblingIdsForShareScope("selected", typescriptId, allIds, issued),
      [],
    );
    assert.equal(canCreateIssuedOnlyShare(typescriptId, issued), true);
    assert.equal(canCreateIssuedOnlyShare(javascriptId, issued), false);
  });

  it("does not imply a mixed resume is fully verified", () => {
    assert.equal(resumeImpliesAllSkillsVerified([
      { blockchainVerified: true },
      { blockchainVerified: false },
    ]), false);
    assert.equal(resumeImpliesAllSkillsVerified([
      { blockchainVerified: true },
    ]), true);
  });
});
