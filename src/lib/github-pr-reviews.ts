/**
 * Fetch GitHub pull request reviews and map them into the SIJIL review format.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  fetchGitHubPullRequests,
  fetchGitHubPullReviewComments,
  fetchGitHubPullReviews,
} from "@/lib/github-api";

export type GitHubPrReviewRecord = {
  id: string;
  source: "GitHub";
  reviewer_name: string;
  reviewer_role: "GitHub PR Review";
  review_text: string;
  repository_name: string;
  pull_request_number: number;
  pull_request_title: string;
  created_at: string;
};

export type GitHubPrReviewFetchError =
  | { type: "token_missing"; message: string }
  | { type: "repo_unavailable"; message: string; repository: string };

export type FetchGitHubPrReviewsResult = {
  reviews: GitHubPrReviewRecord[];
  errors: GitHubPrReviewFetchError[];
};

type GitHubRepoRow = {
  repo_id: number;
  repo_name: string;
  full_name: string;
  linked_skill_id?: string | null;
};

function parseOwnerRepo(fullName: string): { owner: string; repo: string } | null {
  const parts = fullName.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  return { owner: parts[0], repo: parts.slice(1).join("/") };
}

function isVerifiedContributor(
  reviewerLogin: string,
  contributors: Set<string>,
  learnerLogin: string,
): boolean {
  const normalized = reviewerLogin.toLowerCase();
  if (!normalized || normalized === learnerLogin) return false;
  return contributors.has(normalized);
}

function mapPullReview(
  item: Record<string, unknown>,
  repoName: string,
  prNumber: number,
  prTitle: string,
  kind: "review" | "comment",
): GitHubPrReviewRecord | null {
  const user = item.user as { login?: string } | undefined;
  const reviewerName = user?.login ?? "";
  const body = String(item.body ?? "").trim();
  const state = String(item.state ?? "").trim();

  if (!reviewerName) return null;
  if (!body && kind === "review" && state === "COMMENTED") return null;
  if (!body && kind === "comment") return null;

  const reviewText = body || (kind === "review" && state ? `GitHub PR review: ${state}` : "");
  if (!reviewText) return null;

  const itemId = item.id ?? `${kind}-${prNumber}-${reviewerName}-${reviewText.slice(0, 24)}`;
  const createdAt =
    (item.submitted_at as string | undefined)
    ?? (item.created_at as string | undefined)
    ?? (item.updated_at as string | undefined)
    ?? new Date().toISOString();

  return {
    id: `gh-pr-${repoName}-${prNumber}-${kind}-${itemId}`,
    source: "GitHub",
    reviewer_name: reviewerName,
    reviewer_role: "GitHub PR Review",
    review_text: reviewText,
    repository_name: repoName,
    pull_request_number: prNumber,
    pull_request_title: prTitle,
    created_at: createdAt,
  };
}

async function loadContributorLogins(userId: string): Promise<Map<number, Set<string>>> {
  const byRepo = new Map<number, Set<string>>();
  const { data } = await supabase
    .from("github_repo_contributors")
    .select("repo_id, contributor_login")
    .eq("user_id", userId);

  for (const row of data ?? []) {
    const repoId = Number(row.repo_id);
    const login = String(row.contributor_login ?? "").toLowerCase();
    if (!repoId || !login) continue;
    const set = byRepo.get(repoId) ?? new Set<string>();
    set.add(login);
    byRepo.set(repoId, set);
  }

  return byRepo;
}

type FetchGitHubPrReviewsOptions = {
  maxRepos?: number;
  maxPullsPerRepo?: number;
  linkedOnly?: boolean;
};

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function fetchGitHubPrReviewsForUser(
  userId: string,
  options: FetchGitHubPrReviewsOptions = {},
): Promise<FetchGitHubPrReviewsResult> {
  const maxRepos = options.maxRepos ?? 4;
  const maxPullsPerRepo = options.maxPullsPerRepo ?? 5;
  const linkedOnly = options.linkedOnly !== false;
  const errors: GitHubPrReviewFetchError[] = [];
  const reviews: GitHubPrReviewRecord[] = [];
  const seen = new Set<string>();

  const { data: connection } = await supabase
    .from("github_connections")
    .select("access_token, github_username")
    .eq("user_id", userId)
    .maybeSingle();

  if (!connection?.access_token) {
    return { reviews: [], errors: [] };
  }

  const token = connection.access_token as string;
  const learnerLogin = String(connection.github_username ?? "").toLowerCase();

  let repoQuery = supabase
    .from("github_repos")
    .select("repo_id, repo_name, full_name, linked_skill_id")
    .eq("user_id", userId)
    .order("last_updated", { ascending: false, nullsFirst: false })
    .limit(maxRepos);

  if (linkedOnly) {
    repoQuery = repoQuery.not("linked_skill_id", "is", null);
  }

  const { data: repos } = await repoQuery;
  const repoRows = ((repos ?? []) as GitHubRepoRow[]).slice(0, maxRepos);
  if (repoRows.length === 0) {
    return { reviews: [], errors: [] };
  }

  const contributorLoginsByRepo = await loadContributorLogins(userId);

  await mapPool(repoRows, 3, async (repo) => {
    const fullName = String(repo.full_name ?? "").trim();
    const repoName = String(repo.repo_name ?? fullName.split("/").pop() ?? "Repository");
    const parsed = parseOwnerRepo(fullName);
    if (!parsed) return;

    const contributorLogins = contributorLoginsByRepo.get(Number(repo.repo_id)) ?? new Set<string>();
    const pullsResult = await fetchGitHubPullRequests(
      token,
      parsed.owner,
      parsed.repo,
      maxPullsPerRepo,
    );

    if (!pullsResult.ok) {
      errors.push({
        type: "repo_unavailable",
        message: "Repository not accessible",
        repository: repoName,
      });
      return;
    }

    const pulls = pullsResult.pulls.slice(0, maxPullsPerRepo);
    const pullBatches = await Promise.all(
      pulls.map(async (pull) => {
        const prNumber = Number(pull.number);
        const prTitle = String(pull.title ?? `Pull request #${prNumber}`);
        if (!Number.isFinite(prNumber)) return [] as GitHubPrReviewRecord[];

        const [prReviews, prComments] = await Promise.all([
          fetchGitHubPullReviews(token, parsed.owner, parsed.repo, prNumber),
          fetchGitHubPullReviewComments(token, parsed.owner, parsed.repo, prNumber),
        ]);

        return [
          ...prReviews.map((item) => mapPullReview(item, repoName, prNumber, prTitle, "review")),
          ...prComments.map((item) => mapPullReview(item, repoName, prNumber, prTitle, "comment")),
        ].filter((item): item is GitHubPrReviewRecord => item != null);
      }),
    );

    for (const item of pullBatches.flat()) {
      if (!isVerifiedContributor(item.reviewer_name, contributorLogins, learnerLogin)) continue;
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      reviews.push(item);
    }
  });

  return { reviews, errors };
}
