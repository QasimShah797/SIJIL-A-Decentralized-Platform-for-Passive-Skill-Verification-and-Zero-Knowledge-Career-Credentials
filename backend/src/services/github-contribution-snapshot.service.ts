import { randomUUID } from "node:crypto";
import { getServiceSupabase } from "../config/supabase";
import {
  verifyGitHubIdentity,
  fetchPaginatedGitHubCommits,
  countUniqueGitHubCommits,
} from "./github-contribution-verification.service";

export interface GitHubContributionSnapshot {
  snapshotId: string;
  userId: string;
  githubUserId: number;
  githubUsername: string;
  repositoryFullName: string;
  contributionCount: number;
  verifiedAt: string;
}

type GitHubConnectionResult = {
  data: {
    github_user_id: number | string;
    github_username: string;
    access_token: string;
  } | null;
  error: { message: string } | null;
};

const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

async function loadGitHubConnection(userId: string): Promise<GitHubConnectionResult> {
  // Trusted snapshots always load the connected token with the service role.
  // Browser or anon credentials must never supply this path.
  return getServiceSupabase()
    .from("github_connections")
    .select("github_user_id, github_username, access_token")
    .eq("user_id", userId)
    .maybeSingle();
}

export async function createGitHubContributionSnapshot(
  userId: string,
  repositoryFullName: string,
  fetchImpl: typeof fetch = fetch,
  loadConnection: (userId: string) => Promise<GitHubConnectionResult> = loadGitHubConnection,
): Promise<GitHubContributionSnapshot> {
  if (!userId.trim()) {
    throw new Error("SIJIL user ID is required");
  }

  if (!REPOSITORY.test(repositoryFullName)) {
    throw new Error("Repository must use owner/name form");
  }

  const { data: connection, error } = await loadConnection(userId);

  if (error) {
    throw new Error("Could not load GitHub connection");
  }

  if (!connection) {
    throw new Error("GitHub account is not connected");
  }

  const rawId: unknown = connection.github_user_id;
  const githubUserId =
    typeof rawId === "number"
      ? rawId
      : typeof rawId === "string" && /^[1-9][0-9]*$/.test(rawId)
        ? Number(rawId)
        : NaN;

  if (!Number.isSafeInteger(githubUserId) || githubUserId <= 0) {
    throw new Error("Invalid stored GitHub user ID");
  }

  const githubUsername = connection.github_username;
  const accessToken = connection.access_token;

  if (
    typeof githubUsername !== "string" ||
    !githubUsername.trim() ||
    typeof accessToken !== "string" ||
    !accessToken.trim()
  ) {
    throw new Error("Invalid GitHub connection");
  }

  const identity = await verifyGitHubIdentity({
    accessToken,
    expectedUsername: githubUsername,
    fetchImpl,
  });

  if (identity.id !== githubUserId) {
    throw new Error("GitHub account ID does not match");
  }

  const commits = await fetchPaginatedGitHubCommits({
    accessToken,
    repositoryFullName,
    githubUsername: identity.login,
    expectedGitHubUserId: identity.id,
    fetchImpl,
  });

  return {
    snapshotId: randomUUID(),
    userId,
    githubUserId: identity.id,
    githubUsername: identity.login,
    repositoryFullName,
    contributionCount: countUniqueGitHubCommits(commits),
    verifiedAt: new Date().toISOString(),
  };
}
