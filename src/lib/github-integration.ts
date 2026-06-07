import { supabase } from "@/integrations/supabase/client";

export type GitHubConnection = {
  github_username: string;
  github_avatar_url: string | null;
  scopes: string | null;
  connected_at: string;
  last_synced_at: string | null;
};

export function githubCallbackUrl(): string {
  return `${window.location.origin}/auth/github/callback`;
}

/** Start GitHub OAuth — redirects browser to GitHub authorize page. */
export async function startGitHubOAuth(): Promise<string> {
  const { data, error } = await supabase.functions.invoke("github-oauth-start", {
    body: { redirect_uri: githubCallbackUrl() },
  });
  if (error) throw error;
  const url = (data as { authorize_url?: string })?.authorize_url;
  if (!url) throw new Error((data as { error?: string })?.error ?? "No authorize URL returned");
  return url;
}

/** Exchange OAuth code for a stored connection (server-side token). */
export async function completeGitHubOAuth(code: string, state: string): Promise<{ github_username: string }> {
  const { data, error } = await supabase.functions.invoke("github-oauth-callback", {
    body: { code, state, redirect_uri: githubCallbackUrl() },
  });
  if (error) throw error;
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return {
    github_username: (data as { github_username?: string }).github_username ?? "",
  };
}

/** Pull repos, commits, PRs, contributors from GitHub API via edge function. */
export async function syncGitHubPortfolio(
  declaredSkills: Array<{ id: string; name: string }> = [],
): Promise<{ synced: number; repos: number; contributors: number }> {
  const { data, error } = await supabase.functions.invoke("github-sync", {
    body: { declared_skills: declaredSkills },
  });
  if (error) throw error;
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return {
    synced: (data as { synced?: number }).synced ?? 0,
    repos: (data as { repos?: number }).repos ?? 0,
    contributors: (data as { contributors?: number }).contributors ?? 0,
  };
}

export async function fetchGitHubConnection(userId: string): Promise<GitHubConnection | null> {
  const { data, error } = await supabase
    .from("github_connections")
    .select("github_username,github_avatar_url,scopes,connected_at,last_synced_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as GitHubConnection | null;
}

export async function disconnectGitHub(userId: string): Promise<void> {
  await supabase.from("github_repo_contributors").delete().eq("user_id", userId);
  await supabase.from("github_repos").delete().eq("user_id", userId);
  await supabase.from("github_activities").delete().eq("user_id", userId);
  await supabase.from("github_connections").delete().eq("user_id", userId);
}

export async function linkRepoToSkill(
  repoId: string,
  skillId: string | null,
  skillName: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("github_repos")
    .update({
      linked_skill_id: skillId,
      linked_skill_name: skillName,
      linked_at: skillId ? new Date().toISOString() : null,
    })
    .eq("id", repoId);
  if (error) throw error;
}
