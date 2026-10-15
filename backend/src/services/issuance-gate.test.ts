import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PIPELINE_STAGE } from "../constants/status";
import { evaluateIssuanceEligibility } from "./issuance-gate";

const learnerA = "11111111-1111-1111-1111-111111111111";
const learnerB = "22222222-2222-2222-2222-222222222222";

describe("issuance gate", () => {
  it("rejects when a learner tries to issue another learner's skill", () => {
    const result = evaluateIssuanceEligibility({
      skillOwnerId: learnerB,
      requestUserId: learnerA,
      pipelineStage: PIPELINE_STAGE.WALLET_READY,
      evidence: [{ source: "LMS", title: "Course" }],
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
      assert.match(result.message, /does not belong/i);
    }
  });

  it("rejects a learner with an unverified skill", () => {
    const result = evaluateIssuanceEligibility({
      skillOwnerId: learnerA,
      requestUserId: learnerA,
      pipelineStage: PIPELINE_STAGE.DECLARED,
      evidence: [{ source: "LMS", title: "Course" }],
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 409);
      assert.match(result.message, /not verified or attested/i);
    }
  });

  it("rejects attested skills that have no supporting evidence", () => {
    const result = evaluateIssuanceEligibility({
      skillOwnerId: learnerA,
      requestUserId: learnerA,
      pipelineStage: PIPELINE_STAGE.WALLET_READY,
      evidence: [],
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 409);
      assert.match(result.message, /trust tier/i);
    }
  });

  it("allows the owner to issue a wallet-ready skill with LMS evidence", () => {
    const result = evaluateIssuanceEligibility({
      skillOwnerId: learnerA,
      requestUserId: learnerA,
      pipelineStage: PIPELINE_STAGE.WALLET_READY,
      evidence: [{ source: "LMS", title: "Moodle module" }],
    });
    assert.equal(result.ok, true);
  });

  it("allows issuance of an attested skill with corroborating GitHub evidence", () => {
    const result = evaluateIssuanceEligibility({
      skillOwnerId: learnerA,
      requestUserId: learnerA,
      pipelineStage: PIPELINE_STAGE.IN_WALLET,
      evidence: [{ source: "GitHub", title: "repo", url: "https://github.com/org/repo" }],
    });
    assert.equal(result.ok, true);
  });

  it("allows a wallet-ready skill with GitHub supporting evidence", () => {
    const result = evaluateIssuanceEligibility({
      skillOwnerId: learnerA,
      requestUserId: learnerA,
      pipelineStage: PIPELINE_STAGE.WALLET_READY,
      evidence: [{ source: "GitHub", title: "sijil", url: "https://github.com/org/sijil" }],
    });
    assert.equal(result.ok, true);
  });

  it("rejects GitHub evidence when the stored stage is not wallet-ready", () => {
    const result = evaluateIssuanceEligibility({
      skillOwnerId: learnerA,
      requestUserId: learnerA,
      pipelineStage: PIPELINE_STAGE.EVIDENCE_LINKED,
      evidence: [{ source: "GitHub", title: "sijil", url: "https://github.com/org/sijil" }],
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 409);
      assert.match(result.message, /not verified or attested/i);
    }
  });

  it("allows GitHub evidence with a nullable content_hash", () => {
    const result = evaluateIssuanceEligibility({
      skillOwnerId: learnerA,
      requestUserId: learnerA,
      pipelineStage: PIPELINE_STAGE.WALLET_READY,
      evidence: [{
        source: "GitHub",
        title: "sijil",
        url: "https://github.com/org/sijil",
        contentHash: null,
      }],
    });
    assert.equal(result.ok, true);
  });
});
