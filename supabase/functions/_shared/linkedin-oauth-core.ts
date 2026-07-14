import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

export type LinkedInOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export function getLinkedInOAuthConfig(): LinkedInOAuthConfig | null {
  const clientId = Deno.env.get("LINKEDIN_CLIENT_ID")?.trim();
  const clientSecret = Deno.env.get("LINKEDIN_CLIENT_SECRET")?.trim();
  const redirectUri = Deno.env.get("LINKEDIN_REDIRECT_URI")?.trim()?.replace(/\/$/, "");
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

/** True when LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, and LINKEDIN_REDIRECT_URI are set. */
export function hasLinkedInOAuthSecrets(): boolean {
  return getLinkedInOAuthConfig() !== null;
}

export function getFrontendUrl(): string {
  return Deno.env.get("FRONTEND_URL")?.trim()?.replace(/\/$/, "") ?? "";
}

export function isLinkedInOAuthConfigured(): boolean {
  return hasLinkedInOAuthSecrets();
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function generateCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

/** Cryptographically secure OAuth state token (URL-safe). */
export function generateSecureOAuthState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export async function pkceChallengeFromVerifier(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

export async function buildLinkedInAuthorizeUrl(
  config: LinkedInOAuthConfig,
  state: string,
  codeVerifier: string,
): Promise<string> {
  const challenge = await pkceChallengeFromVerifier(codeVerifier);
  const url = new URL("https://www.linkedin.com/oauth/v2/authorization");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export type TokenExchangeResult = {
  accessToken: string;
  status: number;
};

export async function exchangeLinkedInCode(
  config: LinkedInOAuthConfig,
  code: string,
  codeVerifier: string,
): Promise<TokenExchangeResult> {
  const tokenResp = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code_verifier: codeVerifier,
    }).toString(),
  });

  const tokenData = await tokenResp.json().catch(() => ({}));
  if (!tokenResp.ok || !tokenData.access_token) {
    console.error("LinkedIn token exchange failed", {
      status: tokenResp.status,
      error: tokenData.error ?? null,
      error_description: tokenData.error_description ?? null,
    });
    throw new Error("token_exchange_failed");
  }

  return {
    accessToken: tokenData.access_token as string,
    status: tokenResp.status,
  };
}

export type UserInfoResult = {
  profile: Record<string, unknown>;
  status: number;
};

export async function fetchLinkedInUserInfo(accessToken: string): Promise<UserInfoResult> {
  const profileResp = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const profile = await profileResp.json().catch(() => ({}));
  return {
    profile: profile as Record<string, unknown>,
    status: profileResp.status,
  };
}

export function resolveDisplayName(profile: Record<string, unknown>): string | null {
  const name = (profile.name as string | undefined)?.trim();
  if (name) return name;
  const given = (profile.given_name as string | undefined)?.trim();
  const family = (profile.family_name as string | undefined)?.trim();
  const combined = [given, family].filter(Boolean).join(" ").trim();
  return combined || null;
}

/** Only accept URLs LinkedIn actually returns — never construct from member id or vanity name. */
export function extractLinkedInProfileUrl(profile: Record<string, unknown>): string | null {
  const candidates = [profile.profile, profile.profile_url, profile.publicProfileUrl];
  for (const c of candidates) {
    if (typeof c !== "string" || !c.trim()) continue;
    const v = c.trim();
    if (v.startsWith("http://") || v.startsWith("https://")) return v;
    if (v.startsWith("linkedin.com/") || v.startsWith("www.linkedin.com/")) return `https://${v}`;
  }
  return null;
}

export function serviceAdmin(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export async function purgeExpiredOAuthStates(admin: SupabaseClient): Promise<void> {
  const { error } = await admin
    .from("linkedin_oauth_states")
    .delete()
    .lt("expires_at", new Date().toISOString());
  if (error) console.error("purge expired linkedin oauth states failed", error);
}

export async function saveOAuthState(
  admin: SupabaseClient,
  userId: string,
  state: string,
  codeVerifier: string,
  returnTo: string | null,
): Promise<void> {
  await purgeExpiredOAuthStates(admin);

  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const { error } = await admin.from("linkedin_oauth_states").insert({
    state,
    user_id: userId,
    code_verifier: codeVerifier,
    return_to: returnTo,
    expires_at: expiresAt,
    used: false,
  });
  if (error) throw new Error(error.message);
}

export type ValidatedOAuthState = {
  id: string;
  userId: string;
  codeVerifier: string;
  returnTo: string | null;
  expired: boolean;
};

/** Find and validate OAuth state without marking it used. */
export async function lookupOAuthStateByToken(
  admin: SupabaseClient,
  state: string,
): Promise<ValidatedOAuthState> {
  await purgeExpiredOAuthStates(admin);

  const { data, error } = await admin
    .from("linkedin_oauth_states")
    .select("id, user_id, code_verifier, return_to, expires_at, used")
    .eq("state", state)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("state_invalid");

  if (data.used) throw new Error("state_used");

  const expired = new Date(data.expires_at as string).getTime() < Date.now();
  if (expired) {
    await admin.from("linkedin_oauth_states").delete().eq("id", data.id);
    throw new Error("state_expired");
  }

  return {
    id: data.id as string,
    userId: data.user_id as string,
    codeVerifier: data.code_verifier as string,
    returnTo: (data.return_to as string | null) ?? null,
    expired: false,
  };
}

/** Mark OAuth state used only after token exchange and connection save succeed. */
export async function markOAuthStateUsed(
  admin: SupabaseClient,
  stateId: string,
): Promise<void> {
  const { data, error } = await admin
    .from("linkedin_oauth_states")
    .update({ used: true })
    .eq("id", stateId)
    .eq("used", false)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("state_used");
}

export type ConsumedOAuthState = {
  userId: string;
  codeVerifier: string;
  returnTo: string | null;
};

/** @deprecated Prefer lookupOAuthStateByToken + markOAuthStateUsed after successful save. */
export async function consumeOAuthStateByToken(
  admin: SupabaseClient,
  state: string,
): Promise<ConsumedOAuthState> {
  const validated = await lookupOAuthStateByToken(admin, state);
  await markOAuthStateUsed(admin, validated.id);
  return {
    userId: validated.userId,
    codeVerifier: validated.codeVerifier,
    returnTo: validated.returnTo,
  };
}

export async function consumeOAuthState(
  admin: SupabaseClient,
  userId: string,
  state: string,
): Promise<{ codeVerifier: string; returnTo: string | null }> {
  const consumed = await consumeOAuthStateByToken(admin, state);
  if (consumed.userId !== userId) throw new Error("state_invalid");
  return { codeVerifier: consumed.codeVerifier, returnTo: consumed.returnTo };
}

export type LinkedInConnectionResult = {
  linkedin_member_id: string;
  display_name: string;
  profile_url: string | null;
  avatar_url: string | null;
  return_to: string | null;
};

export type LinkedInCallbackLog = {
  callbackReached?: boolean;
  method?: string;
  codeExists?: boolean;
  stateExists?: boolean;
  storedStateFound?: boolean;
  stateUserId?: string | null;
  stateExpired?: boolean;
  tokenExchangeStatus?: number;
  userinfoStatus?: number;
  linkedinSubExists?: boolean;
  connectionUpsert?: "success" | "failure";
  redirectType?: "connected" | "error";
  reason?: string;
};

export async function completeLinkedInOAuthExchange(
  code: string,
  state: string,
  log?: LinkedInCallbackLog,
): Promise<LinkedInConnectionResult> {
  const config = getLinkedInOAuthConfig();
  if (!config) throw new Error("server_not_configured");

  const admin = serviceAdmin();
  const oauthState = await lookupOAuthStateByToken(admin, state);

  if (log) {
    log.storedStateFound = true;
    log.stateUserId = oauthState.userId;
    log.stateExpired = oauthState.expired;
  }

  const { accessToken, status: tokenStatus } = await exchangeLinkedInCode(
    config,
    code,
    oauthState.codeVerifier,
  );
  if (log) log.tokenExchangeStatus = tokenStatus;

  const { profile, status: userinfoStatus } = await fetchLinkedInUserInfo(accessToken);
  if (log) log.userinfoStatus = userinfoStatus;

  if (!userinfoStatus || userinfoStatus < 200 || userinfoStatus >= 300) {
    console.error("LinkedIn userinfo request failed", { status: userinfoStatus });
    throw new Error("userinfo_invalid");
  }

  const memberId = String(profile.sub ?? "").trim();
  if (log) log.linkedinSubExists = !!memberId;
  if (!memberId) {
    console.error("LinkedIn userinfo missing sub", { status: userinfoStatus });
    throw new Error("userinfo_invalid");
  }

  const { data: existingLink } = await admin
    .from("linkedin_connections")
    .select("user_id")
    .eq("linkedin_member_id", memberId)
    .maybeSingle();

  if (existingLink && existingLink.user_id !== oauthState.userId) {
    throw new Error("already_linked");
  }

  const displayName = resolveDisplayName(profile);
  const email = typeof profile.email === "string" ? profile.email : null;
  const avatarUrl = typeof profile.picture === "string" ? profile.picture : null;
  const profileUrl = extractLinkedInProfileUrl(profile);
  const now = new Date().toISOString();

  const payload = {
    user_id: oauthState.userId,
    linkedin_member_id: String(profile.sub),
    display_name: displayName,
    email,
    avatar_url: avatarUrl,
    profile_url: profileUrl,
    verified_at: now,
    connected_at: now,
    updated_at: now,
  };

  const { data: saved, error: upErr } = await admin
    .from("linkedin_connections")
    .upsert(payload, { onConflict: "user_id" })
    .select()
    .single();

  if (upErr || !saved) {
    if (log) log.connectionUpsert = "failure";
    console.error("linkedin_connections upsert failed", {
      code: upErr?.code ?? null,
      message: upErr?.message ?? "upsert returned no row",
      details: upErr?.details ?? null,
    });
    throw new Error("connection_save_failed");
  }

  if (log) log.connectionUpsert = "success";

  await markOAuthStateUsed(admin, oauthState.id);

  if (profileUrl) {
    await admin.from("learner_profiles").update({ linkedin_url: profileUrl }).eq(
      "user_id",
      oauthState.userId,
    );
  }

  console.log("linkedin_connections row saved", {
    user_id: saved.user_id,
    linkedin_member_id: saved.linkedin_member_id,
    profile_url_returned: saved.profile_url !== null,
    databaseSaveSuccess: true,
  });

  return {
    linkedin_member_id: memberId,
    display_name: displayName ?? "",
    profile_url: profileUrl,
    avatar_url: avatarUrl,
    return_to: oauthState.returnTo,
  };
}

export function buildFrontendRedirect(
  status: "connected" | "error",
  returnPath?: string | null,
  reason?: string,
): string {
  const base = getFrontendUrl() || "http://localhost:8080";
  const path = returnPath?.startsWith("/") ? returnPath : "/learner/complete-profile";
  const url = new URL(path, base);
  url.searchParams.set("linkedin", status);
  if (reason) url.searchParams.set("reason", reason);
  return url.toString();
}

export function mapOAuthErrorCode(err: unknown, linkedInError?: string | null): string {
  if (linkedInError === "access_denied" || linkedInError === "user_cancelled_authorize") {
    return "user_denied";
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("state_expired")) return "state_expired";
  if (msg.includes("state_used")) return "state_used";
  if (msg.includes("state_invalid")) return "state_invalid";
  if (msg.includes("already_linked")) return "already_linked";
  if (msg.includes("token_exchange_failed")) return "token_exchange_failed";
  if (msg.includes("userinfo_invalid") || msg.includes("userinfo_failed")) return "userinfo_invalid";
  if (msg.includes("server_not_configured")) return "server_not_configured";
  if (msg.includes("connection_save_failed") || msg.includes("db_upsert_failed")) {
    return "connection_save_failed";
  }
  return "oauth_failed";
}
