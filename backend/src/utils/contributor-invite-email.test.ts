import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AppError } from "./AppError";
import {
  assertContributorInviteEmail,
  assertReviewerIdentityForInvite,
  bulkInvitationPlan,
  canResendStoredInvitation,
  contributorAssurance,
  invitationRecipient,
  unverifiedFeedbackLabels,
} from "./contributor-invite-email";
import { isDeliverableEmail, publicGitHubProfileEmail } from "./githubContributorEmail";

describe("contributor invitation security", () => {
  it("accepts a public GitHub profile email", () => {
    assert.equal(publicGitHubProfileEmail("Ada@Example.com"), "ada@example.com");
    assert.equal(invitationRecipient({
      profileEmail: "Ada@Example.com",
      requestedEmail: "ignored@example.com",
    }), "ada@example.com");
  });

  it("rejects a missing public email", () => {
    assert.equal(publicGitHubProfileEmail(null), null);
    assert.equal(publicGitHubProfileEmail("  "), null);
    assert.equal(invitationRecipient({ profileEmail: null, requestedEmail: "typed@example.com" }), null);
  });

  it("rejects a noreply email", () => {
    assert.equal(isDeliverableEmail("123+user@users.noreply.github.com"), false);
    assert.equal(isDeliverableEmail("support@github.com"), false);
    assert.equal(invitationRecipient({
      profileEmail: "123+ada@users.noreply.github.com",
      requestedEmail: "ada@example.com",
    }), null);
  });

  it("does not use a commit-only email as the recipient", () => {
    assert.equal(invitationRecipient({
      profileEmail: null,
      requestedEmail: "author-from-commit@example.com",
    }), null);
  });

  it("ignores a forged frontend recipient", () => {
    assert.equal(invitationRecipient({
      profileEmail: "ada@example.com",
      requestedEmail: "attacker@example.com",
    }), "ada@example.com");
  });

  it("blocks resend of an existing manual invitation", () => {
    assert.equal(canResendStoredInvitation({
      storedInviteEmail: "typed-by-learner@example.com",
      profileEmail: "ada@example.com",
    }), false);
    assert.equal(canResendStoredInvitation({
      storedInviteEmail: "typed-by-learner@example.com",
      profileEmail: null,
    }), false);
    assert.equal(canResendStoredInvitation({
      storedInviteEmail: "ada@example.com",
      profileEmail: "ada@example.com",
    }), true);
  });

  it("applies the same rule to a bulk invitation", () => {
    const plan = bulkInvitationPlan([
      { id: "public", profileEmail: "ada@example.com", requestedEmail: "forged@example.com" },
      { id: "missing", profileEmail: null, requestedEmail: "typed@example.com" },
      { id: "noreply", profileEmail: "ada@users.noreply.github.com", requestedEmail: "ada@example.com" },
      { id: "commit", profileEmail: null, requestedEmail: "commit-author@example.com" },
    ]);
    assert.deepEqual(plan.map((row) => ({ id: row.id, send: row.send, email: row.email })), [
      { id: "public", send: true, email: "ada@example.com" },
      { id: "missing", send: false, email: null },
      { id: "noreply", send: false, email: null },
      { id: "commit", send: false, email: null },
    ]);
  });

  it("does not treat an unauthenticated link submission as identity", () => {
    assert.throws(
      () => assertReviewerIdentityForInvite({
        invitedEmail: "ada@example.com",
        invitedGithubLogin: "ada",
        submittedGithub: "ada",
      }),
      (error: unknown) => error instanceof AppError && error.statusCode === 403,
    );
  });

  it("does not award verified labels from email discovery or link possession", () => {
    const labels = unverifiedFeedbackLabels();
    assert.equal(labels.contributorVerification, "Contributor Pending Verification");
    assert.equal(labels.contextStatus, "Context Pending");
    assert.equal(contributorAssurance({
      invitedEmail: "ada@example.com",
      githubPublishedEmail: "ada@example.com",
    }), "github_published");
    assert.notEqual(labels.contributorVerification, "Contributor Verified");
    assert.notEqual(labels.contextStatus, "Context Verified");
  });

  it("still refuses to redirect a context request away from an address already on file", () => {
    assert.throws(
      () => assertContributorInviteEmail({
        contributorId: "contrib-1",
        contributorEmailOnFile: "ada@example.com",
        requestedEmail: "other@example.com",
      }),
      (error: unknown) => error instanceof AppError && error.statusCode === 403,
    );
  });
});
