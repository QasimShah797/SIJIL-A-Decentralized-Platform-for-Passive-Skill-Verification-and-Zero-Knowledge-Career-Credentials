/**
 * Resolve a contributor invitation address from the public GitHub profile.
 * GET /users/{login} is the only source. Commit author addresses are not used.
 */
import { supabaseService } from "../services/supabase.service";

const GH = "https://api.github.com";
const EMAIL_CACHE_TTL_MS = 10 * 60 * 1000;

type CachedEmail = { email: string | null; at: number };

const emailCache = new Map<string, CachedEmail>();

function emailCacheKey(repoFullName: string | undefined, login: string): string {
  return `profile::${(repoFullName ?? "").toLowerCase()}::${login.toLowerCase()}`;
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

/** GitHub returns this only when the user published it on their profile. Commit author addresses are not accepted. */
export function publicGitHubProfileEmail(email: string | null | undefined): string | null {
  if (!isDeliverableEmail(email)) return null;
  return email!.trim().toLowerCase();
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
): Promise<string | null> {
  const resp = await fetch(`${GH}/users/${encodeURIComponent(login)}`, { headers: ghHeaders(token) });
  if (!resp.ok) return null;
  const user = await resp.json() as { email?: string | null };
  return publicGitHubProfileEmail(user.email);
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

  const email = await lookupGitHubUserEmail(normalizedLogin, token);
  writeCachedEmail(repoFullName, normalizedLogin, email);
  return email;
}

/** Fill contributor addresses from each user's public GitHub profile. */
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

  await mapWithLimit(pending, 6, async (login) => {
    const email = await lookupGitHubUserEmail(login, token);
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
  if (!isDeliverableEmail(normalizedEmail)) return;

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
