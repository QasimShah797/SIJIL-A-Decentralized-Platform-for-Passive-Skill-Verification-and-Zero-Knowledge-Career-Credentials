/**
 * Resolve deliverable email addresses for GitHub contributors.
 * GitHub rarely exposes profile emails; we also scan recent commit metadata.
 */
import { supabaseService } from "../services/supabase.service";

const GH = "https://api.github.com";

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
    // Fall through to commit scan.
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
