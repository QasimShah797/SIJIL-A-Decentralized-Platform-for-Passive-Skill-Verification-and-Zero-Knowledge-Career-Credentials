import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { env } from "../config/env";
import { createTrustedGitHubContributionSnapshot } from "./github-contribution-persistence.service";

describe("Trusted GitHub contribution persistence security", () => {
  it("rejects an invalid learner UUID before accessing external services", async () => {
    await assert.rejects(
      createTrustedGitHubContributionSnapshot(
        "invalid-learner-id",
        "testlearner/demo",
      ),
      /Valid learner UUID is required/,
    );
  });

  it("rejects an anon-key fallback before accessing external services", async () => {
    const originalServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;

    try {
      env.SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_ANON_KEY;

      await assert.rejects(
        createTrustedGitHubContributionSnapshot(
          "123e4567-e89b-42d3-a456-426614174000",
          "testlearner/demo",
        ),
        /Real Supabase service-role credentials are required/,
      );
    } finally {
      env.SUPABASE_SERVICE_ROLE_KEY = originalServiceKey;
    }
  });
});

describe("Trusted GitHub contribution persistence with mocked dependencies", () => {
  const learnerId = "123e4567-e89b-42d3-a456-426614174000";
  const snapshotId = "223e4567-e89b-42d3-a456-426614174000";
  const repository = "testlearner/demo";

  function createMockDependencies(
    rpcError: { message: string } | null = null,
  ) {
    const calls: Record<string, string | number>[] = [];

    const createSnapshot = async () => ({
      snapshotId,
      userId: learnerId,
      githubUserId: 12345,
      githubUsername: "testlearner",
      repositoryFullName: repository,
      contributionCount: 25,
      verifiedAt: "2026-10-31T10:00:00.000Z",
    });

    const persistSnapshot = async (
      args: Record<string, string | number>,
    ) => {
      calls.push(args);
      return { error: rpcError };
    };

    return {
      dependencies: { createSnapshot, persistSnapshot },
      calls,
    };
  }

  it("persists a verified snapshot with its Poseidon commitment", async () => {
    const { dependencies, calls } = createMockDependencies();

    const result = await createTrustedGitHubContributionSnapshot(
      learnerId,
      repository,
      dependencies,
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0].p_snapshot_id, snapshotId);
    assert.equal(calls[0].p_learner_user_id, learnerId);
    assert.equal(calls[0].p_contribution_count, 25);
    assert.equal(calls[0].p_github_user_id, 12345);

    assert.equal(
      calls[0].p_commitment,
      result.commitment.commitment,
    );

    assert.equal(result.commitment.circuitId, "github-contributions-v1");
    assert.equal(result.commitment.scheme, "poseidon-bn254-v1");
    assert.equal(typeof calls[0].p_blinding, "string");
    assert.equal(result.snapshotId, snapshotId);
  });

  it("rejects a failed Supabase RPC operation", async () => {
    const { dependencies, calls } = createMockDependencies({
      message: "Mock database failure",
    });

    await assert.rejects(
      createTrustedGitHubContributionSnapshot(
        learnerId,
        repository,
        dependencies,
      ),
      /Could not persist trusted GitHub contribution snapshot/,
    );

    assert.equal(calls.length, 1);
  });
});
