import { env } from "../config/env";
import { getServiceSupabase } from "../config/supabase";
import { loadGitHubCommitmentModule } from "./github-commitment-loader";
import { createGitHubContributionSnapshot } from "./github-contribution-snapshot.service";

interface PersistenceDependencies {
  createSnapshot: typeof createGitHubContributionSnapshot;
  persistSnapshot: (
    args: Record<string, string | number>,
  ) => Promise<{ error: { message: string } | null }>;
}

const defaultDependencies: PersistenceDependencies = {
  createSnapshot: createGitHubContributionSnapshot,
  persistSnapshot: async (args) => {
    const { error } = await getServiceSupabase().rpc(
      "create_github_contribution_snapshot",
      args,
    );
    return { error };
  },
};

export async function createTrustedGitHubContributionSnapshot(
  learnerId: string,
  repositoryFullName: string,
  dependencies: PersistenceDependencies = defaultDependencies,
) {
  if (
    !env.SUPABASE_SERVICE_ROLE_KEY ||
    env.SUPABASE_SERVICE_ROLE_KEY === env.SUPABASE_ANON_KEY
  ) {
    throw new Error("Real Supabase service-role credentials are required");
  }

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(learnerId)
  ) {
    throw new Error("Valid learner UUID is required");
  }

  // Count is obtained from the trusted GitHub verification workflow.
  const snapshot = await dependencies.createSnapshot(
    learnerId,
    repositoryFullName,
  );

  const commitmentModule = await loadGitHubCommitmentModule();

  const result = await commitmentModule.createGitHubCommitment({
    count: snapshot.contributionCount,
    learnerId,
    snapshotId: snapshot.snapshotId,
  });

  const valid = await commitmentModule.verifyGitHubOpening({
    ...result.opening,
    commitment: result.publicCommitment.commitment,
  });

  if (!valid) {
    throw new Error("GitHub Poseidon commitment verification failed");
  }

  const { error } = await dependencies.persistSnapshot({
      p_snapshot_id: snapshot.snapshotId,
      p_learner_user_id: learnerId,
      p_github_user_id: snapshot.githubUserId,
      p_github_username: snapshot.githubUsername,
      p_repository_full_name: snapshot.repositoryFullName,
      p_verified_at: snapshot.verifiedAt,
      p_commitment: result.publicCommitment.commitment,
      p_contribution_count: snapshot.contributionCount,
      p_blinding: result.opening.blinding,
    },
  );

  if (error) {
    throw new Error("Could not persist trusted GitHub contribution snapshot");
  }

  return {
    snapshotId: snapshot.snapshotId,
    learnerId,
    repositoryFullName: snapshot.repositoryFullName,
    verifiedAt: snapshot.verifiedAt,
    commitment: result.publicCommitment,
  };
}
