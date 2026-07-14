import { AppError } from "./AppError";

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
  if (onFile && requested !== onFile) {
    throw new AppError(
      "The invite must use the verified contributor's contact email already on file",
      403,
    );
  }

  const existingInvite = normalizeEmail(params.existingInviteEmail);
  if (existingInvite && requested !== existingInvite) {
    throw new AppError(
      "Review invite email cannot be changed to a different recipient",
      403,
    );
  }

  if (!onFile) {
    // Manual entry is allowed only when GitHub did not expose a deliverable email.
    // Once an invite exists, the recipient cannot be changed.
    return;
  }
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

  const emailMatch = Boolean(invitedEmail && submittedEmail && submittedEmail === invitedEmail);
  const githubMatch = Boolean(invitedGithub && submittedGithub && submittedGithub === invitedGithub);

  if (invitedEmail && invitedGithub) {
    if (!emailMatch && !githubMatch) {
      throw new AppError(
        "This review link is only for the invited contributor. Enter your invited email or GitHub username.",
        403,
      );
    }
    return;
  }

  if (invitedEmail && !emailMatch) {
    throw new AppError("This review link is only for the invited contributor email", 403);
  }

  if (invitedGithub && !githubMatch) {
    throw new AppError("This review link is only for the invited GitHub contributor", 403);
  }
}
