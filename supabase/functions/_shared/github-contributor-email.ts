const GH = "https://api.github.com";

function ghHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "SIJIL-edge",
  };
}

export function isDeliverableEmail(email: string | null | undefined): boolean {
  if (!email?.trim()) return false;
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return false;
  if (normalized.includes("@users.noreply.github.com")) return false;
  if (normalized.endsWith("@github.com")) return false;
  return true;
}

export async function resolveGitHubUserEmail(
  login: string,
  token: string,
  repoFullName?: string,
): Promise<string | null> {
  const normalizedLogin = login.trim();
  if (!normalizedLogin) return null;

  try {
    const userResp = await fetch(`${GH}/users/${encodeURIComponent(normalizedLogin)}`, {
      headers: ghHeaders(token),
    });
    if (userResp.ok) {
      const user = await userResp.json() as { email?: string | null };
      if (isDeliverableEmail(user.email)) {
        return user.email!.trim().toLowerCase();
      }
    }
  } catch {
    // Fall through.
  }

  if (!repoFullName) return null;

  try {
    const commitsResp = await fetch(
      `${GH}/repos/${repoFullName}/commits?author=${encodeURIComponent(normalizedLogin)}&per_page=30`,
      { headers: ghHeaders(token) },
    );
    if (!commitsResp.ok) return null;

    const commits = await commitsResp.json() as Array<{
      commit?: { author?: { email?: string | null } };
    }>;
    if (!Array.isArray(commits)) return null;

    for (const commit of commits) {
      const email = commit.commit?.author?.email?.trim().toLowerCase();
      if (isDeliverableEmail(email)) return email!;
    }
  } catch {
    // Best-effort lookup.
  }

  return null;
}
