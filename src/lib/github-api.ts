const GITHUB_API = "https://api.github.com";

// Pass the token stored after OAuth
export async function fetchGitHubUser(token: string) {
  const res = await fetch(`${GITHUB_API}/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (!res.ok) throw new Error("Failed to fetch GitHub user");
  return res.json();
}

export async function fetchGitHubRepos(token: string) {
  const res = await fetch(`${GITHUB_API}/user/repos?sort=updated&per_page=50`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (!res.ok) throw new Error("Failed to fetch GitHub repos");
  return res.json();
}

export async function fetchGitHubCommits(token: string, owner: string, repo: string) {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/commits?per_page=20`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (!res.ok) throw new Error("Failed to fetch commits");
  return res.json();
}

function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "SIJIL-app",
  };
}

export async function fetchGitHubPullRequests(
  token: string,
  owner: string,
  repo: string,
): Promise<{ ok: boolean; status: number; pulls: Array<Record<string, unknown>> }> {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/pulls?state=all&per_page=30&sort=updated&direction=desc`,
    { headers: githubHeaders(token) },
  );
  if (!res.ok) {
    return { ok: false, status: res.status, pulls: [] };
  }
  const pulls = await res.json();
  return {
    ok: true,
    status: res.status,
    pulls: Array.isArray(pulls) ? pulls as Array<Record<string, unknown>> : [],
  };
}

export async function fetchGitHubPullReviews(
  token: string,
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<Array<Record<string, unknown>>> {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/pulls/${pullNumber}/reviews`,
    { headers: githubHeaders(token) },
  );
  if (!res.ok) return [];
  const reviews = await res.json();
  return Array.isArray(reviews) ? reviews as Array<Record<string, unknown>> : [];
}

export async function fetchGitHubPullReviewComments(
  token: string,
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<Array<Record<string, unknown>>> {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/pulls/${pullNumber}/comments?per_page=100`,
    { headers: githubHeaders(token) },
  );
  if (!res.ok) return [];
  const comments = await res.json();
  return Array.isArray(comments) ? comments as Array<Record<string, unknown>> : [];
}
