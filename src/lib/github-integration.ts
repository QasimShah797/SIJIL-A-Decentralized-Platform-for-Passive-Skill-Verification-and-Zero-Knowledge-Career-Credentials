import { supabase } from "@/integrations/supabase/client";
import {
  clearGitHubOAuthContext,
  getGitHubOAuthConfig,
  loadGitHubOAuthContext,
  saveGitHubOAuthContext,
} from "@/lib/github-env";

export type GitHubConnection = {
  github_username: string;
  github_avatar_url: string | null;
  scopes: string | null;
  connected_at: string;
  last_synced_at: string | null;
};

export type GitHubSyncStats = {
  synced: number;
  repos: number;
  contributors: number;
};

export type GitHubOAuthResult = {
  github_username: string;
  sync?: GitHubSyncStats;
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined);

async function requireSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session) throw new Error("You must be signed in");
  return data.session;
}

/** Direct fetch to edge functions — more reliable than SDK invoke in some setups. */
async function invokeEdge<T>(name: string, body?: Record<string, unknown>): Promise<T> {
  const session = await requireSession();

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env");
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: SUPABASE_KEY,
    },
    body: JSON.stringify(body ?? {}),
  });

  let payload: T & { error?: string; message?: string };
  try {
    payload = await res.json();
  } catch {
    throw new Error(`Edge function "${name}" returned an invalid response (${res.status})`);
  }

  if (!res.ok) {
    const msg = payload?.error ?? payload?.message ?? `Edge function "${name}" failed (${res.status})`;
    throw new Error(msg);
  }
  if (payload?.error) throw new Error(payload.error);
  return payload;
}

export function githubCallbackUrl(): string {
  return getGitHubOAuthConfig().redirectUri;
}

/** Build skill list for repo-to-skill auto-linking during sync. */
export function buildSkillsForGitHubSync(
  declared: { id: string; name: string }[],
  credentials: { skill: string }[],
): { id: string; name: string }[] {
  const walletSkills = Array.from(
    new Set(
      credentials.flatMap((c) =>
        c.skill.split(/\s*[+&/]\s*/).map((s) => s.trim()).filter(Boolean),
      ),
    ),
  ).map((name) => ({
    id: `wallet-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name,
  }));

  return [
    ...declared.map((s) => ({ id: s.id, name: s.name })),
    ...walletSkills.filter((w) => !declared.some((d) => d.name.toLowerCase() === w.name.toLowerCase())),
  ];
}

/**
 * Start GitHub OAuth — builds authorize URL in the browser.
 * client_id + redirect_uri must match Supabase GITHUB_OAUTH_* secrets and your GitHub OAuth app.
 */
export async function startGitHubOAuth(): Promise<string> {
  const { clientId, redirectUri } = getGitHubOAuthConfig();
  const session = await requireSession();

  saveGitHubOAuthContext(clientId, redirectUri);

  const stateRaw = `${session.user.id}.${crypto.randomUUID()}`;
  const stateB64 = btoa(stateRaw);

  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "read:user user:email repo");
  url.searchParams.set("state", stateB64);
  url.searchParams.set("allow_signup", "true");

  return url.toString();
}

/** Exchange OAuth code for a stored connection; server runs initial portfolio sync. */
export async function completeGitHubOAuth(code: string, state: string): Promise<GitHubOAuthResult> {
  const ctx = loadGitHubOAuthContext();
  const { clientId, redirectUri } = ctx ?? getGitHubOAuthConfig();

  try {
    const data = await invokeEdge<{
      github_username?: string;
      sync?: GitHubSyncStats;
    }>("github-oauth-callback", {
      code,
      state,
      redirect_uri: redirectUri,
      client_id: clientId,
    });
    return {
      github_username: data.github_username ?? "",
      sync: data.sync,
    };
  } finally {
    clearGitHubOAuthContext();
  }
}

/** Pull repos, commits, PRs, contributors from GitHub API via edge function. */
export async function syncGitHubPortfolio(
  declaredSkills: Array<{ id: string; name: string }> = [],
): Promise<GitHubSyncStats> {
  const data = await invokeEdge<GitHubSyncStats & { upserted?: number }>("github-sync", {
    declared_skills: declaredSkills,
  });
  return {
    synced: data.synced ?? 0,
    repos: data.repos ?? 0,
    contributors: data.contributors ?? 0,
  };
}

export async function fetchGitHubConnection(userId: string): Promise<GitHubConnection | null> {
  const { data, error } = await supabase
    .from("github_connections_public")
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
