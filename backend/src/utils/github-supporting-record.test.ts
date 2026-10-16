import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  findDuplicateGitHubSupportingRecord,
  isQualifyingGitHubEvidence,
  normalizeGitHubRepoUrl,
  qualifyingGitHubTitle,
} from "./github-supporting-record";

const userId = "11111111-1111-1111-1111-111111111111";
const skillId = "22222222-2222-2222-2222-222222222222";

describe("GitHub supporting record identity", () => {
  it("accepts a real github.com owner/repo URL", () => {
    assert.equal(
      normalizeGitHubRepoUrl("https://github.com/org/sijil"),
      "https://github.com/org/sijil",
    );
    assert.equal(
      normalizeGitHubRepoUrl("https://www.github.com/Org/Sijil.git"),
      "https://github.com/org/sijil",
    );
  });

  it("rejects invented or incomplete URLs", () => {
    assert.equal(normalizeGitHubRepoUrl(""), null);
    assert.equal(normalizeGitHubRepoUrl("not-a-url"), null);
    assert.equal(normalizeGitHubRepoUrl("https://example.com/org/sijil"), null);
    assert.equal(normalizeGitHubRepoUrl("https://github.com/org"), null);
    assert.equal(normalizeGitHubRepoUrl("javascript:alert(1)"), null);
  });

  it("requires ownership, skill association, title, and URL", () => {
    assert.equal(
      isQualifyingGitHubEvidence({
        userId,
        skillId,
        skillOwnerId: userId,
        title: "sijil",
        url: "https://github.com/org/sijil",
      }),
      true,
    );
    assert.equal(
      isQualifyingGitHubEvidence({
        userId,
        skillId,
        skillOwnerId: "other-user",
        title: "sijil",
        url: "https://github.com/org/sijil",
      }),
      false,
    );
    assert.equal(
      isQualifyingGitHubEvidence({
        userId,
        skillId,
        skillOwnerId: userId,
        title: "   ",
        url: "https://github.com/org/sijil",
      }),
      false,
    );
    assert.equal(
      isQualifyingGitHubEvidence({
        userId,
        skillId: "",
        skillOwnerId: userId,
        title: "sijil",
        url: "https://github.com/org/sijil",
      }),
      false,
    );
  });

  it("dedupes the same repository URL for a skill", () => {
    const existing = [
      { id: "a", url: "https://github.com/org/sijil.git" },
      { id: "b", url: "https://github.com/org/other" },
    ];
    const match = findDuplicateGitHubSupportingRecord(
      existing,
      normalizeGitHubRepoUrl("https://github.com/org/sijil")!,
    );
    assert.equal(match?.id, "a");
    assert.equal(qualifyingGitHubTitle("sijil"), "sijil");
  });
});
