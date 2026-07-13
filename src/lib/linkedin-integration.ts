import { supabase } from "@/integrations/supabase/client";
import { clearLinkedInOAuthState, saveLinkedInReturnTo } from "@/lib/linkedin-env";

export type LinkedInConnection = {
  linkedin_member_id: string;
  display_name: string | null;
  email: string | null;
  profile_url: string | null;
  avatar_url: string | null;
  verified_at: string | null;
  connected_at: string;
};

type LinkedInOAuthStatusResponse = {
  configured?: boolean;
  oauth_configured?: boolean;
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined);

let configuredCache: boolean | null = null;

const LINKEDIN_AUTHORIZE_PREFIX = "https://www.linkedin.com/";

async function requireSession() {
  const { error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) {
    console.warn("[LinkedIn OAuth] session refresh failed:", refreshError.message);
  }

  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw new Error(error.message);
  }

  if (!session?.access_token) {
    throw new Error("Your session has expired. Please sign in again.");
  }

  return session;
}

/** POST to edge functions with Authorization — never navigate the browser to the function URL. */
async function postLinkedInEdge<T>(
  name: string,
  body: Record<string, unknown>,
  accessToken?: string,
): Promise<T> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env",
    );
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: SUPABASE_KEY,
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  console.log(`[LinkedIn OAuth] POST ${SUPABASE_URL}/functions/v1/${name}`, {
    action: body.action,
    hasAuthorization: !!accessToken,
  });

  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  let payload: T & { error?: string; message?: string };
  try {
    payload = await res.json();
  } catch {
    throw new Error(`Edge function "${name}" returned an invalid response (${res.status})`);
  }

  if (!res.ok) {
    const msg =
      payload?.error ?? payload?.message ?? `Edge function "${name}" failed (${res.status})`;
    throw new Error(msg);
  }

  if (payload?.error) {
    throw new Error(payload.error);
  }

  return payload;
}

function assertLinkedInAuthorizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed.startsWith(LINKEDIN_AUTHORIZE_PREFIX)) {
    throw new Error(
      "Invalid LinkedIn authorization URL received from server. Expected linkedin.com OAuth URL.",
    );
  }
  if (trimmed.includes("/functions/v1/")) {
    throw new Error(
      "Server returned a Supabase function URL instead of a LinkedIn authorization URL.",
    );
  }
  return trimmed;
}

function isExplicitlyUnavailable(status: LinkedInOAuthStatusResponse): boolean {
  return status.configured === false && status.oauth_configured === false;
}

function isExplicitlyConfigured(status: LinkedInOAuthStatusResponse): boolean {
  return status.oauth_configured === true || status.configured === true;
}

/**
 * Probe server-side LinkedIn OAuth configuration.
 * Status does not require auth — uses POST fetch, not browser navigation.
 */
export async function probeLinkedInOAuthConfigured(): Promise<boolean> {
  resetLinkedInConfiguredCache();

  try {
    const data = await postLinkedInEdge<LinkedInOAuthStatusResponse>("linkedin-oauth-start", {
      action: "status",
    });

    console.log("[LinkedIn OAuth] status response:", {
      configured: data.configured,
      oauth_configured: data.oauth_configured,
    });

    if (isExplicitlyUnavailable(data)) {
      configuredCache = false;
      console.log("[LinkedIn OAuth] configured value: false (server reported secrets missing)");
      return false;
    }

    if (isExplicitlyConfigured(data)) {
      configuredCache = true;
      console.log("[LinkedIn OAuth] configured value: true");
      return true;
    }

    configuredCache = true;
    console.log("[LinkedIn OAuth] configured value: true (ambiguous status — defaulting to available)");
    return true;
  } catch (error) {
    configuredCache = null;
    console.warn("[LinkedIn OAuth] status probe failed — showing Connect button:", error);
    return true;
  }
}

export function isLinkedInOAuthConfigured(): boolean {
  return configuredCache !== false;
}

export function resetLinkedInConfiguredCache() {
  configuredCache = null;
}

export { clearLinkedInOAuthState };

export type StartLinkedInOAuthOptions = {
  returnTo?: string;
};

/**
 * Start LinkedIn OAuth: authenticated POST to linkedin-oauth-start, then redirect to LinkedIn.
 * Never navigates the browser to the Supabase Edge Function URL.
 */
export async function startLinkedInOAuth(
  options?: StartLinkedInOAuthOptions,
): Promise<string> {
  const returnTo = options?.returnTo ?? "/learner/complete-profile";
  saveLinkedInReturnTo(returnTo);

  const { error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) {
    console.warn("[LinkedIn OAuth] session refresh failed:", refreshError.message);
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Your session has expired. Please sign in again.");
  }

  console.log("[LinkedIn OAuth] invoking linkedin-oauth-start via supabase.functions.invoke");

  const { data, error } = await supabase.functions.invoke("linkedin-oauth-start", {
    body: {
      action: "start",
      return_to: returnTo,
    },
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (error) {
    console.error("[LinkedIn OAuth] functions.invoke error:", error.message);
    throw new Error(error.message || "LinkedIn OAuth start failed.");
  }

  const payload = data as { authorize_url?: string; error?: string } | null;
  console.log("[LinkedIn OAuth] start response:", {
    hasAuthorizeUrl: !!payload?.authorize_url,
    error: payload?.error,
  });

  if (payload?.error) {
    throw new Error(payload.error);
  }

  if (!payload?.authorize_url) {
    throw new Error("LinkedIn OAuth did not return an authorization URL.");
  }

  return assertLinkedInAuthorizeUrl(payload.authorize_url);
}

/** Complete LinkedIn OAuth when the SPA handles the callback (fallback route). */
export async function completeLinkedInOAuth(
  code: string,
  state: string,
): Promise<{
  display_name: string;
  return_to: string | null;
}> {
  if (!code) {
    throw new Error("Missing LinkedIn authorization code.");
  }

  if (!state) {
    throw new Error("Missing LinkedIn OAuth state.");
  }

  const data = await postLinkedInEdge<{
    display_name?: string;
    return_to?: string | null;
  }>("linkedin-oauth-callback", { code, state });

  return {
    display_name: data.display_name ?? "",
    return_to: data.return_to ?? null,
  };
}

/** Load the authenticated learner's LinkedIn connection. */
export async function fetchLinkedInConnection(
  userId: string,
): Promise<LinkedInConnection | null> {
  if (!userId) return null;

  const { data, error } = await supabase
    .from("linkedin_connections")
    .select(
      "linkedin_member_id, display_name, email, profile_url, avatar_url, verified_at, connected_at",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as LinkedInConnection | null;
}

/** Disconnect the authenticated learner's LinkedIn account. */
export async function disconnectLinkedIn(userId: string): Promise<void> {
  if (!userId) {
    throw new Error("Missing learner user ID.");
  }

  const session = await requireSession();

  const { error: connectionError } = await supabase
    .from("linkedin_connections")
    .delete()
    .eq("user_id", userId);

  if (connectionError) {
    throw new Error(connectionError.message);
  }

  const { error: profileError } = await supabase
    .from("learner_profiles")
    .update({
      linkedin_url: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", session.user.id);

  if (profileError) {
    throw new Error(profileError.message);
  }

  resetLinkedInConfiguredCache();
}
