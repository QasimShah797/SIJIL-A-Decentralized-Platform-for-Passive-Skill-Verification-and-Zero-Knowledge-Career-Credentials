/**
 * Google Calendar OAuth configuration (Phase 1 — admin connect only).
 * Optional until an admin starts the connect flow.
 */
import { env } from "./env";
import { AppError } from "../utils/AppError";

export const GOOGLE_CALENDAR_EVENTS_SCOPE = "https://www.googleapis.com/auth/calendar.events";
export const GOOGLE_OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_OAUTH_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
export const GOOGLE_OAUTH_REVOKE_URL = "https://oauth2.googleapis.com/revoke";

export type GoogleCalendarOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  encryptionKey: string;
};

export function getGoogleCalendarOAuthConfig(): GoogleCalendarOAuthConfig | null {
  const clientId = env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const redirectUri = env.GOOGLE_CALENDAR_REDIRECT_URI;
  const encryptionKey = env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY;
  if (!clientId || !clientSecret || !redirectUri || !encryptionKey) {
    return null;
  }
  return { clientId, clientSecret, redirectUri, encryptionKey };
}

export function requireGoogleCalendarOAuthConfig(): GoogleCalendarOAuthConfig {
  const config = getGoogleCalendarOAuthConfig();
  if (!config) {
    throw new AppError(
      "Google Calendar OAuth is not configured. Set GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET, GOOGLE_CALENDAR_REDIRECT_URI, and GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY in backend/.env.",
      503,
    );
  }
  return config;
}

export function buildGoogleCalendarAuthorizeUrl(state: string, config: GoogleCalendarOAuthConfig): string {
  const url = new URL(GOOGLE_OAUTH_AUTH_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_CALENDAR_EVENTS_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return url.toString();
}
