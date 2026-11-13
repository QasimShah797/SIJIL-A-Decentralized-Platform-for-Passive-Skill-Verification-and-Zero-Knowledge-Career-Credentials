/**
 * Regression tests for GitHub activity_title builders.
 * Run: node --experimental-strip-types --test supabase/functions/_shared/github-activity-titles.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatIssueEventActivityTitle,
  formatPullRequestEventActivityTitle,
  formatPullRequestSearchActivityTitle,
  normalizeGithubSubjectTitle,
} from "./github-activity-titles.ts";

describe("normalizeGithubSubjectTitle", () => {
  it("preserves valid titles", () => {
    assert.equal(normalizeGithubSubjectTitle("Fix parser", "Untitled"), "Fix parser");
    assert.equal(
      normalizeGithubSubjectTitle("Handle undefined values", "Untitled"),
      "Handle undefined values",
    );
  });

  it("falls back for missing null undefined and empty", () => {
    assert.equal(normalizeGithubSubjectTitle(undefined, "Untitled pull request"), "Untitled pull request");
    assert.equal(normalizeGithubSubjectTitle(null, "Untitled pull request"), "Untitled pull request");
    assert.equal(normalizeGithubSubjectTitle("", "Untitled pull request"), "Untitled pull request");
    assert.equal(normalizeGithubSubjectTitle("   ", "Untitled pull request"), "Untitled pull request");
    assert.equal(normalizeGithubSubjectTitle("undefined", "Untitled pull request"), "Untitled pull request");
    assert.equal(normalizeGithubSubjectTitle("null", "Untitled issue"), "Untitled issue");
  });
});

describe("formatPullRequestEventActivityTitle", () => {
  it("formats a PR with a valid title", () => {
    assert.equal(
      formatPullRequestEventActivityTitle(11, "opened", "Add auth guard"),
      "PR #11 opened: Add auth guard",
    );
  });

  it("uses Untitled pull request when title is missing", () => {
    assert.equal(
      formatPullRequestEventActivityTitle(11, "merged", undefined),
      "PR #11 merged: Untitled pull request",
    );
  });

  it("uses Untitled pull request when title is null", () => {
    assert.equal(
      formatPullRequestEventActivityTitle(11, "merged", null),
      "PR #11 merged: Untitled pull request",
    );
  });

  it("uses Untitled pull request when title is empty", () => {
    assert.equal(
      formatPullRequestEventActivityTitle(11, "closed", ""),
      "PR #11 closed: Untitled pull request",
    );
  });

  it("never interpolates the literal undefined", () => {
    const title = formatPullRequestEventActivityTitle(11, "merged", undefined);
    assert.equal(title.includes("undefined"), false);
    assert.equal(title, "PR #11 merged: Untitled pull request");
  });
});

describe("formatIssueEventActivityTitle", () => {
  it("uses Untitled issue when title is missing", () => {
    assert.equal(
      formatIssueEventActivityTitle(3, "opened", undefined),
      "Issue #3 opened: Untitled issue",
    );
  });

  it("preserves a valid issue title", () => {
    assert.equal(
      formatIssueEventActivityTitle(3, "closed", "Bug in login"),
      "Issue #3 closed: Bug in login",
    );
  });
});

describe("formatPullRequestSearchActivityTitle", () => {
  it("uses Untitled pull request when search title is missing", () => {
    assert.equal(
      formatPullRequestSearchActivityTitle(7, undefined, "open"),
      "PR #7: Untitled pull request (open)",
    );
  });

  it("preserves a valid search title and state", () => {
    assert.equal(
      formatPullRequestSearchActivityTitle(7, "Docs update", "closed"),
      "PR #7: Docs update (closed)",
    );
  });
});
