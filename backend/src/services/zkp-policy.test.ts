/**
 * Policy constants, comparison boundaries, and variant mapping.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ASSESSMENT_POLICY_THRESHOLD,
  GITHUB_POLICY_THRESHOLD,
  outcomeFromComparison,
  variantForOutcome,
} from "./zkp-policy";

describe("zkp policy constants", () => {
  it("pins assessment 60 and github 70", () => {
    assert.equal(ASSESSMENT_POLICY_THRESHOLD, 60);
    assert.equal(GITHUB_POLICY_THRESHOLD, 70);
  });

  it("maps boundary 59/60 for assessment", () => {
    assert.equal(outcomeFromComparison(59, ASSESSMENT_POLICY_THRESHOLD), "BELOW_THRESHOLD");
    assert.equal(outcomeFromComparison(60, ASSESSMENT_POLICY_THRESHOLD), "MEETS_THRESHOLD");
    assert.equal(variantForOutcome("BELOW_THRESHOLD"), "below");
    assert.equal(variantForOutcome("MEETS_THRESHOLD"), "meets");
  });

  it("maps boundary 69/70 for github", () => {
    assert.equal(outcomeFromComparison(69, GITHUB_POLICY_THRESHOLD), "BELOW_THRESHOLD");
    assert.equal(outcomeFromComparison(70, GITHUB_POLICY_THRESHOLD), "MEETS_THRESHOLD");
  });
});
