/**
 * Completes an approved GitHub activity request from a trusted snapshot.
 * The exact count and blinding stay on the server. A low count is unsatisfied,
 * not a failed API call and not a below-threshold Groth16 proof.
 */
import { AppError } from "../utils/AppError";
import { createTrustedGitHubContributionSnapshot } from "./github-contribution-persistence.service";
import { githubActivityDecision, isGitHubActivityThreshold } from "./github-activity-decision";
import { generateGitHubContributionProof } from "./github-zkp-proof.service";
import { verifyGitHubContributionProof } from "./github-zkp-verify.service";
import { createVerificationWorkflow } from "./zkp-notification.store";

const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function thresholdOf(policyLabel: string) {
  const match = /^At least (\d+) unique commits/.exec(policyLabel);
  if (!match) return null;
  const value = Number(match[1]);
  return isGitHubActivityThreshold(value) ? value : null;
}

export async function fulfillGithubActivityRequest(input: {
  requestId: string;
  learnerUserId: string;
  repositoryFullName: string;
}): Promise<{ status: string; repositoryFullName: string }> {
  if (!REPOSITORY.test(input.repositoryFullName)) {
    throw new AppError("Repository must use owner/name form", 400);
  }
  const workflow = createVerificationWorkflow();
  const request = (await workflow.listForLearner(input.learnerUserId))
    .find((row) => row.id === input.requestId);
  if (!request || request.category !== "github-activity") {
    throw new AppError("Verification request not found", 404);
  }
  if (request.status !== "approved") {
    throw new AppError("Approve the request before a proof can be created.", 409);
  }
  const threshold = request.threshold === 50 || request.threshold === 100 || request.threshold === 150
    ? request.threshold
    : thresholdOf(request.policyLabel);
  if (!threshold) throw new AppError("This request does not have a supported GitHub threshold.", 409);

  await workflow.markRequestGenerating(input.requestId, input.learnerUserId);
  try {
    const snapshot = await createTrustedGitHubContributionSnapshot(input.learnerUserId, input.repositoryFullName);
    const outcome = githubActivityDecision(snapshot.contributionCount, threshold);
    if (outcome === "unsatisfied") {
      const done = await workflow.completeGithubActivity(input.requestId, input.learnerUserId, "unsatisfied", input.repositoryFullName);
      return { status: done.status, repositoryFullName: input.repositoryFullName };
    }
    const commitment = snapshot.commitment.commitment;
    const generated = await generateGitHubContributionProof({
      count: snapshot.contributionCount,
      blinding: snapshot.blinding,
      learnerId: input.learnerUserId,
      snapshotId: snapshot.snapshotId,
      threshold,
      commitment,
    });
    const verified = await verifyGitHubContributionProof(
      { circuitId: "github-contributions-v1", proof: generated.proof, publicSignals: generated.publicSignals },
      commitment,
    );
    if (!verified.cryptographicallyValid || verified.threshold !== String(threshold)) {
      const done = await workflow.completeGithubActivity(input.requestId, input.learnerUserId, "failed", input.repositoryFullName);
      return { status: done.status, repositoryFullName: input.repositoryFullName };
    }
    const done = await workflow.completeGithubActivity(input.requestId, input.learnerUserId, "verified", input.repositoryFullName);
    return { status: done.status, repositoryFullName: input.repositoryFullName };
  } catch (err) {
    if (err instanceof AppError) throw err;
    await workflow.completeGithubActivity(input.requestId, input.learnerUserId, "failed", input.repositoryFullName).catch(() => undefined);
    throw new AppError("The GitHub proof could not be completed. This is not a result about the commit count.", 503);
  }
}
