/**
 * Phase 1: Administrator Google Calendar OAuth connect / status / disconnect.
 * Does not create Calendar events or Meet links.
 */
import { randomBytes } from "node:crypto";
import { getServiceSupabase } from "../config/supabase";
import {
  GOOGLE_CALENDAR_EVENTS_SCOPE,
  GOOGLE_OAUTH_REVOKE_URL,
  GOOGLE_OAUTH_TOKEN_URL,
  GOOGLE_OAUTH_USERINFO_URL,
  buildGoogleCalendarAuthorizeUrl,
  requireGoogleCalendarOAuthConfig,
  type GoogleCalendarOAuthConfig,
} from "../config/google-calendar";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";
import { decryptSecret, encryptSecret, redactSecretsForLog } from "../utils/token-crypto";

const STATE_TTL_MS = 10 * 60 * 1000;

export type GoogleCalendarConnectionStatus = {
  connected: boolean;
  googleEmail: string | null;
  tokenStatus: "active" | "needs_reauth" | "revoked" | null;
  connectedAt: string | null;
};

type TokenExchangeResult = {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number | null;
  scope: string | null;
  tokenType: string | null;
};

function db() {
  return getServiceSupabase();
}

async function purgeExpiredStates(): Promise<void> {
  await db()
    .from("google_calendar_oauth_states")
    .delete()
    .lt("expires_at", new Date().toISOString());
}

export async function createAdminConnectAuthorization(adminUserId: string): Promise<{
  authorizeUrl: string;
  expiresAt: string;
}> {
  const config = requireGoogleCalendarOAuthConfig();
  await purgeExpiredStates();

  const state = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + STATE_TTL_MS).toISOString();
  const { error } = await db().from("google_calendar_oauth_states").insert({
    admin_user_id: adminUserId,
    state,
    expires_at: expiresAt,
    used: false,
  });
  if (error) {
    throw new AppError(
      "Could not start Google Calendar authorization. Apply the google_calendar admin OAuth migration first.",
      500,
    );
  }

  return {
    authorizeUrl: buildGoogleCalendarAuthorizeUrl(state, config),
    expiresAt,
  };
}

async function consumeOAuthState(state: string): Promise<{ id: string; adminUserId: string }> {
  await purgeExpiredStates();

  const { data, error } = await db()
    .from("google_calendar_oauth_states")
    .select("id, admin_user_id, expires_at, used")
    .eq("state", state)
    .maybeSingle();

  if (error) throw new AppError("Could not validate OAuth state", 500);
  if (!data) throw new AppError("Invalid Google Calendar OAuth state", 400);
  if (data.used) throw new AppError("Google Calendar OAuth state was already used", 400);
  if (new Date(data.expires_at as string).getTime() < Date.now()) {
    await db().from("google_calendar_oauth_states").delete().eq("id", data.id);
    throw new AppError("Google Calendar OAuth state expired. Start connect again.", 400);
  }

  const { data: marked, error: markError } = await db()
    .from("google_calendar_oauth_states")
    .update({ used: true })
    .eq("id", data.id)
    .eq("used", false)
    .select("id")
    .maybeSingle();

  if (markError) throw new AppError("Could not consume OAuth state", 500);
  if (!marked) throw new AppError("Google Calendar OAuth state was already used", 400);

  return {
    id: data.id as string,
    adminUserId: data.admin_user_id as string,
  };
}

async function exchangeAuthorizationCode(
  code: string,
  config: GoogleCalendarOAuthConfig,
): Promise<TokenExchangeResult> {
  const body = new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
  });

  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const rawText = await response.text();
  let json: Record<string, unknown> = {};
  try {
    json = rawText ? JSON.parse(rawText) as Record<string, unknown> : {};
  } catch {
    throw new AppError("Google token endpoint returned an invalid response", 502);
  }

  if (!response.ok) {
    const safe = redactSecretsForLog(typeof json.error === "string" ? json.error : `http_${response.status}`);
    console.error("[google-calendar-oauth] token exchange failed", { status: response.status, error: safe });
    throw new AppError("Google rejected the Calendar authorization code", 400);
  }

  const accessToken = typeof json.access_token === "string" ? json.access_token : "";
  const refreshToken = typeof json.refresh_token === "string" ? json.refresh_token : null;
  if (!accessToken) {
    throw new AppError("Google did not return an access token", 502);
  }

  return {
    accessToken,
    refreshToken,
    expiresIn: typeof json.expires_in === "number" ? json.expires_in : null,
    scope: typeof json.scope === "string" ? json.scope : null,
    tokenType: typeof json.token_type === "string" ? json.token_type : null,
  };
}

async function fetchGoogleAccountEmail(accessToken: string): Promise<{ email: string; sub: string | null }> {
  const response = await fetch(GOOGLE_OAUTH_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new AppError("Could not read the connected Google account email", 502);
  }
  const json = await response.json() as { email?: string; sub?: string };
  const email = typeof json.email === "string" ? json.email.trim().toLowerCase() : "";
  if (!email || !email.includes("@")) {
    throw new AppError("Google account email was missing from the OAuth profile", 502);
  }
  return { email, sub: typeof json.sub === "string" ? json.sub : null };
}

async function revokeGoogleTokenQuietly(token: string): Promise<void> {
  try {
    await fetch(`${GOOGLE_OAUTH_REVOKE_URL}?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  } catch {
    // Best-effort revoke; local disconnect still proceeds.
  }
}

export async function completeAdminConnectCallback(input: {
  code?: string | null;
  state?: string | null;
  oauthError?: string | null;
}): Promise<{ googleEmail: string }> {
  if (input.oauthError) {
    throw new AppError(`Google authorization was denied (${input.oauthError})`, 400);
  }
  if (!input.code || !input.state) {
    throw new AppError("Missing Google OAuth code or state", 400);
  }

  const config = requireGoogleCalendarOAuthConfig();
  const consumed = await consumeOAuthState(input.state);
  const tokens = await exchangeAuthorizationCode(input.code, config);

  if (!tokens.refreshToken) {
    // Re-consent without offline access, or Google withheld refresh_token.
    throw new AppError(
      "Google did not return a refresh token. Disconnect any prior SIJIL grant in Google Account permissions, then connect again with consent.",
      400,
    );
  }

  const profile = await fetchGoogleAccountEmail(tokens.accessToken);
  const refreshEncrypted = encryptSecret(tokens.refreshToken, config.encryptionKey);
  const accessEncrypted = encryptSecret(tokens.accessToken, config.encryptionKey);
  const accessExpiresAt = tokens.expiresIn
    ? new Date(Date.now() + tokens.expiresIn * 1000).toISOString()
    : null;

  // Replace any existing singleton connection (reconnect / rotate safely).
  const existing = await db()
    .from("google_calendar_connections")
    .select("id, refresh_token_encrypted")
    .eq("singleton_key", "platform")
    .maybeSingle();

  if (existing.data?.refresh_token_encrypted) {
    try {
      const previousRefresh = decryptSecret(
        existing.data.refresh_token_encrypted as string,
        config.encryptionKey,
      );
      await revokeGoogleTokenQuietly(previousRefresh);
    } catch {
      // Ignore decrypt/revoke failures on reconnect.
    }
  }

  const payload = {
    singleton_key: "platform",
    connected_by_admin_user_id: consumed.adminUserId,
    google_account_email: profile.email,
    google_account_id: profile.sub,
    refresh_token_encrypted: refreshEncrypted,
    access_token_encrypted: accessEncrypted,
    access_token_expires_at: accessExpiresAt,
    scopes: tokens.scope || GOOGLE_CALENDAR_EVENTS_SCOPE,
    token_status: "active",
    updated_at: new Date().toISOString(),
    last_refreshed_at: new Date().toISOString(),
    connected_at: new Date().toISOString(),
  };

  if (existing.data?.id) {
    const { error } = await db()
      .from("google_calendar_connections")
      .update(payload)
      .eq("id", existing.data.id);
    if (error) throw new AppError("Could not update the Google Calendar connection", 500);
  } else {
    const { error } = await db().from("google_calendar_connections").insert(payload);
    if (error) throw new AppError("Could not save the Google Calendar connection", 500);
  }

  return { googleEmail: profile.email };
}

export async function getGoogleCalendarConnectionStatus(): Promise<GoogleCalendarConnectionStatus> {
  const { data, error } = await db()
    .from("google_calendar_connections")
    .select("google_account_email, token_status, connected_at")
    .eq("singleton_key", "platform")
    .maybeSingle();

  if (error) {
    // Table missing until migration is applied.
    if (error.code === "42P01" || /does not exist/i.test(error.message)) {
      return { connected: false, googleEmail: null, tokenStatus: null, connectedAt: null };
    }
    throw new AppError("Could not read Google Calendar connection status", 500);
  }

  if (!data) {
    return { connected: false, googleEmail: null, tokenStatus: null, connectedAt: null };
  }

  const tokenStatus = (data.token_status as GoogleCalendarConnectionStatus["tokenStatus"]) ?? null;
  const connected = tokenStatus === "active";
  return {
    connected,
    googleEmail: connected ? (data.google_account_email as string) : (data.google_account_email as string),
    tokenStatus,
    connectedAt: (data.connected_at as string) ?? null,
  };
}

export async function disconnectGoogleCalendarConnection(): Promise<void> {
  const config = getOptionalEncryptionConfig();
  const { data } = await db()
    .from("google_calendar_connections")
    .select("id, refresh_token_encrypted, access_token_encrypted")
    .eq("singleton_key", "platform")
    .maybeSingle();

  if (!data) return;

  if (config) {
    for (const field of ["refresh_token_encrypted", "access_token_encrypted"] as const) {
      const encrypted = data[field];
      if (typeof encrypted !== "string" || !encrypted) continue;
      try {
        const token = decryptSecret(encrypted, config.encryptionKey);
        await revokeGoogleTokenQuietly(token);
      } catch {
        // Continue disconnect even if revoke fails.
      }
    }
  }

  const { error } = await db()
    .from("google_calendar_connections")
    .delete()
    .eq("id", data.id);
  if (error) throw new AppError("Could not disconnect Google Calendar", 500);
}

function getOptionalEncryptionConfig(): GoogleCalendarOAuthConfig | null {
  try {
    return requireGoogleCalendarOAuthConfig();
  } catch {
    return null;
  }
}

export function buildFrontendRedirect(result: "success" | "error", detail?: string): string {
  const base = env.FRONTEND_URL.replace(/\/$/, "");
  const url = new URL(`${base}/admin/integrations`);
  url.searchParams.set("googleCalendar", result);
  if (detail) url.searchParams.set("reason", detail.slice(0, 120));
  return url.toString();
}

/** Test helpers — pure validation without network. */
export function assertStateShape(state: string): boolean {
  return typeof state === "string" && state.length >= 16 && /^[A-Za-z0-9_-]+$/.test(state);
}
