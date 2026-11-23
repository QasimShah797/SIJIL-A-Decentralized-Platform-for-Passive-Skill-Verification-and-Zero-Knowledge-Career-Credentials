import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateWalletReadyPromotion,
  hasQualifyingGitHubEvidenceRows,
} from "./wallet-ready-promotion";
import {
  normalizeGitHubRepoUrl,
  qualifyingGitHubTitle,
} from "./github-supporting-record";

const learner = "11111111-1111-1111-1111-111111111111";
const skillId = "22222222-2222-2222-2222-222222222222";

function base(overrides: Partial<Parameters<typeof evaluateWalletReadyPromotion>[0]> = {}) {
  return evaluateWalletReadyPromotion({
    callerUserId: learner,
    attemptOwnerId: learner,
    skillId,
    attemptStatus: "in_progress",
    scoredPassed: true,
    scoredPercent: 80,
    hasQualifyingGitHubEvidence: true,
    storedPipelineStage: "evidence_linked",
    clientClaimedPassed: true,
    storedAttemptPassed: true,
    ...overrides,
  });
}

describe("wallet-ready promotion", () => {
  it("promotes a server-scored pass with qualifying GitHub evidence", () => {
    const result = base();
    assert.equal(result.promote, true);
  });

  it("advances a server-scored sitting and rejects unscored or already completed attempts", () => {
    assert.equal(base({ scoredPassed: false, scoredPercent: 10 }).promote, true);
    assert.equal(base({ scoredPassed: true, scoredPercent: 100 }).promote, true);
    assert.equal(base({ scoredPassed: false, scoredPercent: 0 }).promote, true);
    assert.equal(base({ scoredPercent: 101 }).promote, false);
    assert.equal(base({ attemptStatus: "abandoned", scoredPercent: 100 }).promote, false);
    assert.deepEqual(base({ scoredPercent: NaN }), { promote: false, reason: "assessment_not_scored" });
    assert.equal(base({ attemptStatus: "completed", scoredPassed: true, scoredPercent: 100 }).promote, false);
  });

  it("does not let learner-supplied pass flags substitute for server scoring", () => {
    for (const passed of [true, false]) {
      assert.deepEqual(base({
        scoredPercent: NaN,
        clientClaimedPassed: passed,
        storedAttemptPassed: passed,
      }), { promote: false, reason: "assessment_not_scored" });
    }
  });

  it("does not promote without qualifying GitHub evidence", () => {
    const result = base({ hasQualifyingGitHubEvidence: false });
    assert.equal(result.promote, false);
    if (!result.promote) assert.equal(result.reason, "missing_github_evidence");
  });

  it("does not promote another learner's attempt or a missing skill", () => {
    assert.equal(base({ attemptOwnerId: "other" }).promote, false);
    assert.equal(base({ skillId: null }).promote, false);
    assert.equal(base({ storedPipelineStage: "in_wallet" }).promote, false);
  });

  it("does not treat learner-writable github_repos rows as qualifying evidence", () => {
    assert.equal(
      hasQualifyingGitHubEvidenceRows(
        [{ title: "sijil", url: "https://github.com/org/sijil" }],
        [],
        normalizeGitHubRepoUrl,
        qualifyingGitHubTitle,
      ),
      false,
    );
    assert.equal(
      hasQualifyingGitHubEvidenceRows(
        [{ title: "sijil", url: "https://github.com/facebook/react" }],
        [{ source: "GitHub", title: "sijil", url: "https://github.com/org/sijil" }],
        normalizeGitHubRepoUrl,
        qualifyingGitHubTitle,
      ),
      true,
    );
    assert.equal(
      hasQualifyingGitHubEvidenceRows(
        [{ title: "sijil", url: "" }],
        [{ source: "GitHub", title: "sijil", url: "https://example.com/not-github" }],
        normalizeGitHubRepoUrl,
        qualifyingGitHubTitle,
      ),
      false,
    );
    assert.equal(
      hasQualifyingGitHubEvidenceRows(
        [],
        [{ source: "Upload", title: "file", url: "https://github.com/org/sijil" }],
        normalizeGitHubRepoUrl,
        qualifyingGitHubTitle,
      ),
      false,
    );
  });
});
