/**
 * Resolve deliverable email addresses for GitHub contributors.
 * GitHub rarely exposes profile emails; we also scan recent commit metadata.
 */
import { supabaseService } from "../services/supabase.service";

const GH = "https://api.github.com";
const EMAIL_CACHE_TTL_MS = 10 * 60 * 1000;

type CachedEmail = { email: string | null; at: number };

const emailCache = new Map<string, CachedEmail>();

function emailCacheKey(repoFullName: string | undefined, login: string): string {
  return `${(repoFullName ?? "").toLowerCase()}::${login.toLowerCase()}`;
}

function readCachedEmail(repoFullName: string | undefined, login: string): string | null | undefined {
  const key = emailCacheKey(repoFullName, login);
  const hit = emailCache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > EMAIL_CACHE_TTL_MS) {
    emailCache.delete(key);
    return undefined;
  }
  return hit.email;
}

function writeCachedEmail(repoFullName: string | undefined, login: string, email: string | null): void {
  emailCache.set(emailCacheKey(repoFullName, login), { email, at: Date.now() });
}

async function mapWithLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  if (!items.length) return;
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      await fn(items[index]);
    }
  });
  await Promise.all(workers);
}

type GitHubConnection = { token: string; username: string };

function ghHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "SIJIL-backend",
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

export async function getGitHubConnection(userId: string): Promise<GitHubConnection | null> {
  const { data } = await supabaseService.client
    .from("github_connections")
    .select("access_token, github_username")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data?.access_token) return null;
  return {
    token: data.access_token as string,
    username: data.github_username as string,
  };
}

async function lookupGitHubUserEmail(
  login: string,
  token: string,
  repoFullName?: string,
): Promise<string | null> {
  const headers = ghHeaders(token);
  const userUrl = `${GH}/users/${encodeURIComponent(login)}`;
  const commitsUrl = repoFullName
    ? `${GH}/repos/${repoFullName}/commits?author=${encodeURIComponent(login)}&per_page=5`
    : null;

  const [userResult, commitsResult] = await Promise.all([
    fetch(userUrl, { headers }).then(async (resp) => (resp.ok ? resp.json() as Promise<{ email?: string | null }> : null)).catch(() => null),
    commitsUrl
      ? fetch(commitsUrl, { headers }).then(async (resp) => (resp.ok ? resp.json() : null)).catch(() => null)
      : Promise.resolve(null),
  ]);

  const profileEmail = userResult?.email?.trim().toLowerCase();
  if (isDeliverableEmail(profileEmail)) return profileEmail!;

  if (!Array.isArray(commitsResult)) return null;
  for (const commit of commitsResult as Array<{ commit?: { author?: { email?: string | null } } }>) {
    const email = commit.commit?.author?.email?.trim().toLowerCase();
    if (isDeliverableEmail(email)) return email!;
  }
  return null;
}

export async function resolveGitHubUserEmail(
  login: string,
  token: string,
  repoFullName?: string,
): Promise<string | null> {
  const normalizedLogin = login.trim();
  if (!normalizedLogin) return null;

  const cached = readCachedEmail(repoFullName, normalizedLogin);
  if (cached !== undefined) return cached;

  const email = await lookupGitHubUserEmail(normalizedLogin, token, repoFullName);
  writeCachedEmail(repoFullName, normalizedLogin, email);
  return email;
}

/** Fill many contributor emails with one recent-commit scan, then a small parallel fallback. */
export async function resolveGitHubUserEmails(
  logins: string[],
  token: string,
  repoFullName?: string,
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  const pending: string[] = [];

  for (const login of logins) {
    const normalized = login.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (result.has(key)) continue;
    const cached = readCachedEmail(repoFullName, normalized);
    if (cached !== undefined) {
      result.set(key, cached);
      continue;
    }
    pending.push(normalized);
  }

  if (!pending.length) return result;

  const stillMissing = new Set(pending.map((login) => login.toLowerCase()));
  if (repoFullName) {
    try {
      const resp = await fetch(
        `${GH}/repos/${repoFullName}/commits?per_page=100`,
        { headers: ghHeaders(token) },
      );
      if (resp.ok) {
        const commits = await resp.json() as Array<{
          author?: { login?: string } | null;
          commit?: { author?: { email?: string | null } };
        }>;
        if (Array.isArray(commits)) {
          for (const commit of commits) {
            const login = commit.author?.login?.toLowerCase();
            if (!login || !stillMissing.has(login)) continue;
            const email = commit.commit?.author?.email?.trim().toLowerCase() ?? null;
            if (!isDeliverableEmail(email)) continue;
            result.set(login, email);
            writeCachedEmail(repoFullName, login, email);
            stillMissing.delete(login);
          }
        }
      }
    } catch {
      // Fall through to per-author lookup.
    }
  }

  const fallback = pending.filter((login) => stillMissing.has(login.toLowerCase()));
  await mapWithLimit(fallback, 6, async (login) => {
    const email = await lookupGitHubUserEmail(login, token, repoFullName);
    result.set(login.toLowerCase(), email);
    writeCachedEmail(repoFullName, login, email);
  });

  return result;
}

export async function persistContributorEmail(
  userId: string,
  login: string,
  email: string,
  options?: { repoId?: number; evidenceRecordId?: string | null },
): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedLogin = login.trim();

  if (options?.repoId != null) {
    await supabaseService.client
      .from("github_repo_contributors")
      .update({ contributor_email: normalizedEmail })
      .eq("user_id", userId)
      .eq("repo_id", options.repoId)
      .eq("contributor_login", normalizedLogin);
  }

  if (options?.evidenceRecordId) {
    await supabaseService.client
      .from("reviewer_contexts")
      .update({ reviewer_email: normalizedEmail })
      .eq("user_id", userId)
      .eq("evidence_record_id", options.evidenceRecordId)
      .eq("reviewer_login", normalizedLogin);
  }
}
