import type { Provider, Session, User } from "@supabase/supabase-js";
import { ROLE_HOME, fetchUserRoles } from "@/lib/auth-helpers";
import { startGitHubPageSignIn } from "@/lib/github-signin";
import { verifyLearnerAccess } from "@/lib/learner-auth";
import { provisionOAuthLearner } from "@/lib/learner-signup";
import { supabase } from "@/integrations/supabase/client";

export const AUTH_CALLBACK_PATH = "/auth/callback";
export type SocialAuthProvider = Extract<Provider, "google" | "github">;

/** Prefer the current origin root so Supabase Site URL fallbacks still land on the app. */
export function getAuthCallbackUrl(): string {
  return `${window.location.origin}/`;
}

export function hasOAuthReturnInUrl(
  search = window.location.search,
  hash = window.location.hash,
): boolean {
  const query = new URLSearchParams(search);
  const hashParams = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  return Boolean(
    query.get("code") ||
      query.get("error") ||
      hashParams.get("access_token") ||
      hashParams.get("refresh_token") ||
      hashParams.get("error"),
  );
}

function clearOAuthParamsFromUrl() {
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
}

export function oauthDisplayName(user: User): string {
  const meta = user.user_metadata ?? {};
  const candidates = [meta.full_name, meta.name, meta.user_name, meta.preferred_username];
  const named = candidates.find((value): value is string => typeof value === "string" && value.trim().length > 0);
  if (named) return named.trim();

  const given = typeof meta.given_name === "string" ? meta.given_name.trim() : "";
  const family = typeof meta.family_name === "string" ? meta.family_name.trim() : "";
  if (given || family) return `${given} ${family}`.trim();

  return user.email?.split("@")[0] || "Learner";
}

export function oauthCallbackErrorFromUrl(search = window.location.search, hash = window.location.hash): string | null {
  const query = new URLSearchParams(search);
  const hashParams = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const code = query.get("error") || hashParams.get("error");
  if (!code) return null;

  const description = query.get("error_description") || hashParams.get("error_description");
  if (code === "access_denied") return "Sign-in was cancelled.";
  return description?.replace(/\+/g, " ") || "Social sign-in failed. Please try again.";
}

export function friendlyOAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("provider is not enabled") || lower.includes("unsupported provider")) {
    return "This sign-in method is not enabled yet. Use email and password, or enable it in Supabase Auth.";
  }
  if (lower.includes("redirect") && lower.includes("not allowed")) {
    return "This app URL is not allowed for OAuth redirects. Add it in Supabase Auth URL configuration.";
  }
  return message;
}

let activeOAuthPopup: Window | null = null;
let cancelActiveOAuthWait: (() => void) | null = null;

export class OAuthCancelledError extends Error {
  constructor() {
    super("Sign-in cancelled");
    this.name = "OAuthCancelledError";
  }
}

export function closeSocialSignInPopup() {
  try {
    activeOAuthPopup?.close();
  } catch {
    /* ignore */
  }
  activeOAuthPopup = null;
}

export function cancelSocialSignInWait() {
  cancelActiveOAuthWait?.();
  closeSocialSignInPopup();
}

export async function sessionFromPastedOAuthUrl(raw: string): Promise<Session> {
  const tokens = tokensFromOAuthReturnText(raw);
  if ("error" in tokens) {
    throw new Error(tokens.error);
  }

  const { data, error } = await supabase.auth.setSession({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
  });
  if (error || !data.session) {
    throw new Error(friendlyOAuthError(error?.message ?? "Could not restore the Google session from that URL."));
  }
  return data.session;
}

export function tokensFromOAuthReturnText(
  raw: string,
): { access_token: string; refresh_token: string } | { error: string } {
  const text = raw.trim().replace(/^\uFEFF/, "");
  if (!text) {
    return { error: "Paste the #access_token=… fragment or the full 404 address." };
  }

  let hash = "";
  try {
    const url = new URL(text);
    hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
    if (!hash && url.search) hash = url.search.replace(/^\?/, "");
  } catch {
    const hashStart = text.indexOf("#");
    const queryStart = text.indexOf("access_token=");
    if (hashStart >= 0) hash = text.slice(hashStart + 1);
    else if (queryStart >= 0) hash = text.slice(queryStart);
    else hash = text;
  }

  const params = new URLSearchParams(hash);
  const accessToken = params.get("access_token") || text.match(/access_token=([^&\s]+)/)?.[1] || null;
  const refreshToken = params.get("refresh_token") || text.match(/refresh_token=([^&\s]+)/)?.[1] || null;
  const error = params.get("error");
  const errorDescription = params.get("error_description");

  if (error) {
    return {
      error:
        error === "access_denied"
          ? "Sign-in was cancelled."
          : errorDescription?.replace(/\+/g, " ") || "Social sign-in failed.",
    };
  }

  if (!accessToken || !refreshToken) {
    return { error: "Paste the text that starts with #access_token= and includes refresh_token=." };
  }

  return {
    access_token: decodeURIComponent(accessToken),
    refresh_token: decodeURIComponent(refreshToken),
  };
}

export async function startSocialSignIn(provider: SocialAuthProvider): Promise<Session> {
  if (provider === "github") {
    startGitHubPageSignIn();
    return new Promise(() => undefined);
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: getAuthCallbackUrl(),
      skipBrowserRedirect: true,
      scopes: provider === "github" ? "read:user user:email" : undefined,
      queryParams: provider === "google" ? { prompt: "select_account" } : undefined,
    },
  });

  if (error || !data.url) {
    throw new Error(friendlyOAuthError(error?.message ?? "Could not start social sign-in."));
  }

  closeSocialSignInPopup();
  const popup = window.open(data.url, "sijil-oauth", "width=520,height=740,menubar=no,toolbar=no");
  if (!popup) {
    throw new Error("Allow popups for this site, then try again.");
  }
  activeOAuthPopup = popup;
  popup.focus();

  return new Promise<Session>((resolve, reject) => {
    let settled = false;

    const finish = (session: Session | null, failure?: Error) => {
      if (settled) return;
      settled = true;
      cancelActiveOAuthWait = null;
      window.clearInterval(timer);
      window.removeEventListener("message", onMessage);
      closeSocialSignInPopup();
      if (session) resolve(session);
      else reject(failure ?? new Error("Sign-in did not complete."));
    };

    cancelActiveOAuthWait = () => finish(null, new OAuthCancelledError());

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const payload = event.data as { type?: string; url?: string } | null;
      if (payload?.type !== "sijil-oauth-return" || !payload.url) return;
      void sessionFromPastedOAuthUrl(payload.url)
        .then((session) => finish(session))
        .catch((err) => finish(null, err instanceof Error ? err : new Error(formatUnknown(err))));
    };

    window.addEventListener("message", onMessage);

    const timer = window.setInterval(() => {
      if (popup.closed) {
        finish(
          null,
          new Error(
            "Google sent you to an old Codespace 404. Copy that page’s full address and paste it below.",
          ),
        );
        return;
      }

      try {
        const href = popup.location.href;
        if (!href || href === "about:blank") return;
        if (popup.location.origin !== window.location.origin) return;
        if (!hasOAuthReturnInUrl(popup.location.search, popup.location.hash)) return;
        void sessionFromPastedOAuthUrl(popup.location.href).then(
          (session) => finish(session),
          () => {
            /* wait for implicit hash or parent paste */
          },
        );
      } catch {
        /* popup is still on Google / Supabase / Codespace */
      }
    }, 400);
  });
}

function formatUnknown(err: unknown): string {
  return err instanceof Error ? err.message : "Social sign-in failed.";
}

export async function recoverSessionFromUrl(timeoutMs = 12000): Promise<Session | null> {
  const hashParams = new URLSearchParams(
    window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash,
  );
  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");

  if (accessToken && refreshToken) {
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (!error && data.session) {
      clearOAuthParamsFromUrl();
      return data.session;
    }
  }

  const session = await waitForAuthSession(timeoutMs);
  if (session && hasOAuthReturnInUrl()) {
    clearOAuthParamsFromUrl();
  }
  return session;
}

export async function waitForAuthSession(timeoutMs = 12000): Promise<Session | null> {
  const existing = await supabase.auth.getSession();
  if (existing.data.session) return existing.data.session;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (session: Session | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      subscription.unsubscribe();
      resolve(session);
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) finish(session);
    });

    const timer = window.setTimeout(() => finish(null), timeoutMs);

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) finish(data.session);
    });
  });
}

export async function completeOAuthLearnerSignIn(user: User): Promise<string> {
  const roles = await fetchUserRoles(user.id);
  if (roles.includes("recruiter") && !roles.includes("learner")) {
    throw new Error("This account is not a learner account.");
  }

  let access = await verifyLearnerAccess(user.id);
  if (!access.ok) {
    await provisionOAuthLearner(user.id, oauthDisplayName(user));
    access = await verifyLearnerAccess(user.id);
  }

  if (!access.ok) {
    throw new Error("Could not finish setting up your learner account.");
  }

  return access.profileComplete ? ROLE_HOME.learner : "/learner/complete-profile";
}
