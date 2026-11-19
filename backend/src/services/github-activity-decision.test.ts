import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { githubActivityDecision, isGitHubActivityThreshold } from "./github-activity-decision";

describe("GitHub activity request decision", () => {
  it("does not pass 80 attributed commits against a threshold of 100", () => {
    assert.equal(githubActivityDecision(80, 100), "unsatisfied");
  });

  it("passes 120 attributed commits against a threshold of 100", () => {
    assert.equal(githubActivityDecision(120, 100), "verified");
  });

  it("accepts only 50, 100, and 150", () => {
    assert.equal(isGitHubActivityThreshold(50), true);
    assert.equal(isGitHubActivityThreshold(100), true);
    assert.equal(isGitHubActivityThreshold(150), true);
    assert.equal(isGitHubActivityThreshold(70), false);
    assert.equal(isGitHubActivityThreshold(1), false);
  });

  it("refuses a non-integer count instead of calling it unsatisfied", () => {
    assert.throws(() => githubActivityDecision(Number.NaN, 50), /incomplete/);
  });
});
