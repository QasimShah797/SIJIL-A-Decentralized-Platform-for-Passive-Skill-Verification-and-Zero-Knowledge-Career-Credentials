/**
 * GitHub contribution verification helpers.
 *
 * This helper only deduplicates commit records.
 * It does not establish GitHub authenticity or API completeness.
 */

export interface GitHubCommitRef {
  sha: string;
}

export function countUniqueGitHubCommits(
  commits: readonly GitHubCommitRef[],
): number {
  const unique = new Set<string>();

  for (const commit of commits) {
    if (
      !commit ||
      typeof commit.sha !== "string" ||
      !/^[0-9a-f]{6,40}$/i.test(commit.sha)
    ) {
      throw new Error("Invalid GitHub commit SHA");
    }

    unique.add(commit.sha.toLowerCase());
  }

  return unique.size;
}

export interface VerifiedGitHubIdentity {
  id: number;
  login: string;
}

export interface VerifyGitHubIdentityOptions {
  accessToken: string;
  expectedUsername: string;
  fetchImpl?: typeof fetch;
}

export async function verifyGitHubIdentity({
  accessToken,
  expectedUsername,
  fetchImpl = fetch,
}: VerifyGitHubIdentityOptions): Promise<VerifiedGitHubIdentity> {
  if (!accessToken.trim() || !expectedUsername.trim()) {
    throw new Error("GitHub token and expected username are required");
  }

  const response = await fetchImpl("https://api.github.com/user", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "SIJIL-backend",
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub authentication failed: ${response.status}`);
  }

  const data: unknown = await response.json();

  if (
    !data ||
    typeof data !== "object" ||
    !("id" in data) ||
    !("login" in data) ||
    typeof data.id !== "number" ||
    !Number.isSafeInteger(data.id) ||
    data.id <= 0 ||
    typeof data.login !== "string" ||
    !data.login.trim()
  ) {
    throw new Error("Invalid GitHub identity response");
  }

  if (data.login.toLowerCase() !== expectedUsername.toLowerCase()) {
    throw new Error("Connected GitHub account does not match");
  }

  return {
    id: data.id,
    login: data.login,
  };
}

export interface FetchGitHubCommitsOptions {
  accessToken: string;
  repositoryFullName: string;
  githubUsername: string;
  expectedGitHubUserId: number;
  fetchImpl?: typeof fetch;
}

export async function fetchPaginatedGitHubCommits({
  accessToken,
  repositoryFullName,
  githubUsername,
  expectedGitHubUserId,
  fetchImpl = fetch,
}: FetchGitHubCommitsOptions): Promise<GitHubCommitRef[]> {
  if (!accessToken.trim()) {
    throw new Error("GitHub access token is required");
  }

  if (
    !Number.isSafeInteger(expectedGitHubUserId) ||
    expectedGitHubUserId <= 0
  ) {
    throw new Error("Invalid expected GitHub user ID");
  }

  if (
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repositoryFullName) ||
    !/^[A-Za-z0-9-]+$/.test(githubUsername)
  ) {
    throw new Error("Invalid GitHub repository or username");
  }

  const [owner, repo] = repositoryFullName.split("/");

  const baseUrl = new URL(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits`
  );

  baseUrl.searchParams.set("author", githubUsername);
  baseUrl.searchParams.set("per_page", "100");

  let nextUrl: string | null = baseUrl.toString();
  const visited = new Set<string>();
  const commits: GitHubCommitRef[] = [];
  const maxPages = 100;

  while (nextUrl !== null) {
    if (visited.size >= maxPages) {
      throw new Error("GitHub pagination limit exceeded");
    }

    const currentUrl: string = nextUrl;
    const parsed = new URL(currentUrl);

    if (
      parsed.origin !== "https://api.github.com" ||
      parsed.pathname !== baseUrl.pathname ||
      parsed.username ||
      parsed.password ||
      parsed.hash ||
      parsed.searchParams.get("author") !== githubUsername ||
      parsed.searchParams.get("per_page") !== "100" ||
      [...parsed.searchParams.keys()].some(
        (key) => !["author", "per_page", "page"].includes(key)
      ) ||
      (parsed.searchParams.has("page") &&
        !/^[1-9][0-9]*$/.test(parsed.searchParams.get("page") ?? ""))
    ) {
      throw new Error("Unsafe GitHub pagination URL");
    }

    if (visited.has(currentUrl)) {
      throw new Error("GitHub pagination loop detected");
    }

    visited.add(currentUrl);

    const response = await fetchImpl(currentUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "SIJIL-backend",
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub commits API failed: ${response.status}`);
    }

    const data: unknown = await response.json();

    if (!Array.isArray(data)) {
      throw new Error("Invalid GitHub commits API response");
    }

    for (const item of data) {
      if (
        !item ||
        typeof item !== "object" ||
        typeof item.sha !== "string"
      ) {
        throw new Error("Invalid GitHub commit record");
      }

      const author = item.author;

      if (
        !author ||
        typeof author !== "object" ||
        typeof author.id !== "number" ||
        author.id !== expectedGitHubUserId
      ) {
        throw new Error("GitHub commit author does not match");
      }

      commits.push({ sha: item.sha });
    }

    const link = response.headers.get("link");
    nextUrl = null;

    if (link) {
      const parts = link.split(",");

      for (const part of parts) {
        const trimmed = part.trim();

        const match = /^<([^<>]+)>;\s*rel="([^"]+)"$/.exec(trimmed);

        if (!match) {
          throw new Error("Malformed GitHub pagination link");
        }

        const [, url, relation] = match;

        if (relation === "next") {
          if (nextUrl !== null) {
            throw new Error("Malformed GitHub pagination link");
          }

          nextUrl = url;
        }
      }
    }
  }

  return commits;
}
