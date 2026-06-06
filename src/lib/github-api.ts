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
