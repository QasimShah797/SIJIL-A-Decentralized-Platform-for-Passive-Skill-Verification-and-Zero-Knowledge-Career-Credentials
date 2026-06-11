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
const GITHUB_ACTIVE_USER_KEY = "sijil_github_active_user";

export type GitHubOAuthContext = {
  clientId: string;
  redirectUri: string;
  userId: string;
  nonce: string;
};

/** Persist authorize params so callback uses the exact same redirect_uri and user. */
export function saveGitHubOAuthContext(
  clientId: string,
  redirectUri: string,
  userId: string,
  nonce: string,
) {
  sessionStorage.setItem(
    OAUTH_CTX_KEY,
    JSON.stringify({ clientId, redirectUri, userId, nonce } satisfies GitHubOAuthContext),
  );
  sessionStorage.setItem(GITHUB_ACTIVE_USER_KEY, userId);
}

export function loadGitHubOAuthContext(): GitHubOAuthContext | null {
  try {
    const raw = sessionStorage.getItem(OAUTH_CTX_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GitHubOAuthContext>;
    if (!parsed.clientId || !parsed.redirectUri || !parsed.userId || !parsed.nonce) return null;
    return parsed as GitHubOAuthContext;
  } catch {
    return null;
  }
}

export function clearGitHubOAuthContext() {
  sessionStorage.removeItem(OAUTH_CTX_KEY);
}

/** Remove all browser-side GitHub OAuth / session state (call on logout or user switch). */
export function clearAllGitHubConnectionState() {
  clearGitHubOAuthContext();
  sessionStorage.removeItem(GITHUB_ACTIVE_USER_KEY);
}

export function getGitHubActiveUserId(): string | null {
  return sessionStorage.getItem(GITHUB_ACTIVE_USER_KEY);
}

/** Discard stale OAuth context when the signed-in SIJIL user changes. */
export function ensureGitHubContextForUser(userId: string) {
  const ctx = loadGitHubOAuthContext();
  const active = getGitHubActiveUserId();
  if ((ctx && ctx.userId !== userId) || (active && active !== userId)) {
    clearAllGitHubConnectionState();
  }
}
