import { AppError } from "./AppError";
import { isDeliverableEmail, publicGitHubProfileEmail } from "./githubContributorEmail";
import { CONTEXT_STATUS, CONTRIBUTOR_VERIFICATION } from "../constants/peer-review";

export function normalizeEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function normalizeGithubLogin(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/^@/, "").toLowerCase();
}

export function isEmailInviteContributorId(value: string): boolean {
  return normalizeGithubLogin(value).startsWith("email-");
}

export function assertVerifiedContributorOnly(contributorId: string): void {
  if (isEmailInviteContributorId(contributorId)) {
    throw new AppError(
      "Only verified project contributors can receive review invites",
      403,
    );
  }
}

/** The browser recipient is never used. Only the current public profile email can be invited. */
export function invitationRecipient(params: {
  profileEmail?: string | null;
  requestedEmail?: string | null;
}): string | null {
  return publicGitHubProfileEmail(params.profileEmail);
}

export function canResendStoredInvitation(params: {
  storedInviteEmail?: string | null;
  profileEmail?: string | null;
}): boolean {
  const profile = publicGitHubProfileEmail(params.profileEmail);
  const stored = normalizeEmail(params.storedInviteEmail);
  return Boolean(profile && stored && profile === stored);
}

export function bulkInvitationPlan<T extends { profileEmail?: string | null; requestedEmail?: string | null }>(
  rows: T[],
): Array<T & { send: boolean; email: string | null }> {
  return rows.map((row) => {
    const email = invitationRecipient(row);
    return { ...row, email, send: Boolean(email) };
  });
}

/** Email discovery, delivery, and link possession are not GitHub or context verification. */
export function unverifiedFeedbackLabels(): {
  contributorVerification: typeof CONTRIBUTOR_VERIFICATION.PENDING;
  contextStatus: typeof CONTEXT_STATUS.PENDING;
} {
  return {
    contributorVerification: CONTRIBUTOR_VERIFICATION.PENDING,
    contextStatus: CONTEXT_STATUS.PENDING,
  };
}

/** Learner cannot redirect an invite to a different person than the verified contributor. */
export function assertContributorInviteEmail(params: {
  contributorId: string;
  contributorHandle?: string | null;
  contributorEmailOnFile?: string | null;
  requestedEmail: string;
  existingInviteEmail?: string | null;
}): void {
  assertVerifiedContributorOnly(params.contributorId);

  const requested = normalizeEmail(params.requestedEmail);
  if (!requested) {
    throw new AppError("A valid contributor contact email is required", 400);
  }

  const onFile = normalizeEmail(params.contributorEmailOnFile);
  if (onFile && isDeliverableEmail(onFile) && requested !== onFile) {
    throw new AppError(
      "The invite must use the verified contributor's contact email already on file",
      403,
    );
  }

  const existingInvite = normalizeEmail(params.existingInviteEmail);
  if (existingInvite && isDeliverableEmail(existingInvite) && requested !== existingInvite) {
    throw new AppError(
      "Review invite email cannot be changed to a different recipient",
      403,
    );
  }
}

/**
 * A typed address or a public GitHub username is not proof that the sender
 * controls the GitHub account. A matching published address is still only email
 * discovery. It does not authenticate the reviewer.
 */
export function contributorAssurance(params: {
  invitedEmail?: string | null;
  githubPublishedEmail?: string | null;
}): "github_published" | "email_link" {
  const invited = normalizeEmail(params.invitedEmail);
  const published = normalizeEmail(params.githubPublishedEmail);
  if (invited && published && invited === published && isDeliverableEmail(published)) {
    return "github_published";
  }
  return "email_link";
}

export function assertReviewerIdentityForInvite(params: {
  invitedEmail: string | null | undefined;
  invitedGithubLogin: string | null | undefined;
  submittedEmail?: string | null;
  submittedGithub?: string | null;
}): void {
  const invitedEmail = normalizeEmail(params.invitedEmail);
  const submittedEmail = normalizeEmail(params.submittedEmail);
  const invitedGithub = normalizeGithubLogin(params.invitedGithubLogin);
  const submittedGithub = normalizeGithubLogin(params.submittedGithub);

  if (!invitedEmail && !invitedGithub) {
    throw new AppError("This review invite has no reviewer identity configured", 403);
  }

  if (invitedEmail && submittedEmail !== invitedEmail) {
    throw new AppError(
      "This review link is only for the invited email address. A GitHub username does not replace it.",
      403,
    );
  }

  if (submittedGithub && invitedGithub && submittedGithub !== invitedGithub) {
    throw new AppError("The GitHub username does not match the invited contributor", 403);
  }

  if (!invitedEmail && invitedGithub && submittedGithub !== invitedGithub) {
    throw new AppError("This review link is only for the invited GitHub contributor", 403);
  }
}
