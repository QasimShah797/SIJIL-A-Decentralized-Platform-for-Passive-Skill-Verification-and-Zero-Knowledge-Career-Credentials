import { supabase } from "@/integrations/supabase/client";
import { getGitHubOAuthConfig } from "@/lib/github-env";

const SIGNIN_CTX_KEY = "sijil_github_signin_ctx";

type GitHubSignInContext = {
  nonce: string;
  redirectUri: string;
  clientId: string;
};

export function isGitHubSignInState(state: string | null): boolean {
  if (!state) return false;
  try {
    return atob(state).split(".")[0] === "signin";
  } catch {
    return false;
  }
}

export function startGitHubPageSignIn(): void {
  const { clientId, redirectUri } = getGitHubOAuthConfig();
  const nonce = crypto.randomUUID();
  const ctx: GitHubSignInContext = { nonce, redirectUri, clientId };
  sessionStorage.setItem(SIGNIN_CTX_KEY, JSON.stringify(ctx));

  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "read:user user:email");
  url.searchParams.set("state", btoa(`signin.${nonce}`));
  url.searchParams.set("allow_signup", "true");
  url.searchParams.set("prompt", "select_account");
  window.location.assign(url.toString());
}

async function exchangeGitHubSignIn(
  code: string,
  state: string,
  ctx: GitHubSignInContext,
): Promise<{ hashed_token?: string; error?: string }> {
  const body = {
    code,
    state,
    redirect_uri: ctx.redirectUri,
    client_id: ctx.clientId,
  };

  const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "");
  if (apiBase) {
    const res = await fetch(`${apiBase}/auth/github-signin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json?.data?.hashed_token) return json.data;
    if (json?.message) throw new Error(json.message);
    throw new Error(json?.error ?? `GitHub sign-in failed (${res.status})`);
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  const res = await fetch(`${supabaseUrl}/functions/v1/github-oauth-callback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${anonKey}`,
      apikey: anonKey,
    },
    body: JSON.stringify({ mode: "signin", ...body }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload.error) {
    throw new Error(payload.error ?? `GitHub sign-in failed (${res.status})`);
  }
  return payload;
}

export async function completeGitHubPageSignIn(code: string, state: string) {
  const raw = sessionStorage.getItem(SIGNIN_CTX_KEY);
  if (!raw) throw new Error("GitHub sign-in expired. Click GitHub on the sign-in page again.");

  let ctx: GitHubSignInContext;
  try {
    ctx = JSON.parse(raw) as GitHubSignInContext;
  } catch {
    throw new Error("GitHub sign-in expired. Click GitHub on the sign-in page again.");
  }

  let nonce = "";
  try {
    nonce = atob(state).split(".")[1] ?? "";
  } catch {
    throw new Error("Invalid GitHub sign-in state.");
  }
  if (!nonce || nonce !== ctx.nonce) {
    throw new Error("GitHub sign-in state mismatch. Click GitHub on the sign-in page again.");
  }

  const payload = await exchangeGitHubSignIn(code, state, ctx);
  if (!payload.hashed_token) {
    throw new Error("GitHub sign-in did not return a session.");
  }

  const { data, error } = await supabase.auth.verifyOtp({
    type: "email",
    token_hash: payload.hashed_token,
  });
  if (error || !data.session) {
    throw new Error(error?.message ?? "Could not complete GitHub sign-in.");
  }

  sessionStorage.removeItem(SIGNIN_CTX_KEY);
  return data.session;
}
