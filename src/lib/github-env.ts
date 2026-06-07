/** Shared GitHub OAuth env — Vite loads .env.local over .env; keep both in sync. */
export function getGitHubOAuthConfig() {
  const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID as string | undefined;
  const redirectUri =
    (import.meta.env.VITE_GITHUB_REDIRECT_URI as string | undefined)?.trim() ||
    `${window.location.origin}/auth/github/callback`;

  if (!clientId?.trim()) {
    throw new Error(
      "VITE_GITHUB_CLIENT_ID is missing. Add it to .env (must match GITHUB_OAUTH_CLIENT_ID in Supabase secrets).",
    );
  }

  return { clientId: clientId.trim(), redirectUri: redirectUri.replace(/\/$/, "") };
}

const OAUTH_CTX_KEY = "sijil_github_oauth_ctx";

/** Persist authorize params so callback uses the exact same redirect_uri. */
export function saveGitHubOAuthContext(clientId: string, redirectUri: string) {
  sessionStorage.setItem(OAUTH_CTX_KEY, JSON.stringify({ clientId, redirectUri }));
}

export function loadGitHubOAuthContext(): { clientId: string; redirectUri: string } | null {
  try {
    const raw = sessionStorage.getItem(OAUTH_CTX_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as { clientId: string; redirectUri: string };
  } catch {
    return null;
  }
}

export function clearGitHubOAuthContext() {
  sessionStorage.removeItem(OAUTH_CTX_KEY);
}
