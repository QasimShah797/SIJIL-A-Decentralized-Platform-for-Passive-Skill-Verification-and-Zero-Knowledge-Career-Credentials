/**
 * Phase 2: Create Google Calendar events with Meet links using the SIJIL admin connection.
 * Recruiters never supply Google credentials. Tokens never leave the backend.
 */
import { randomUUID } from "node:crypto";
import { getServiceSupabase } from "../config/supabase";
import {
  GOOGLE_OAUTH_TOKEN_URL,
  requireGoogleCalendarOAuthConfig,
} from "../config/google-calendar";
import { AppError } from "../utils/AppError";
import { decryptSecret, encryptSecret, redactSecretsForLog } from "../utils/token-crypto";

const CALENDAR_EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const ACCESS_TOKEN_SKEW_MS = 60_000;

export type CreateMeetEventInput = {
  summary: string;
  description?: string;
  startIso: string;
  durationMinutes: number;
  timeZone?: string | null;
  attendeeEmail?: string | null;
};

export type CreateMeetEventResult = {
  eventId: string;
  meetUrl: string;
  htmlLink: string | null;
};

type ConnectionRow = {
  id: string;
  refresh_token_encrypted: string;
  access_token_encrypted: string | null;
  access_token_expires_at: string | null;
  token_status: string;
};

function db() {
  return getServiceSupabase();
}

async function loadActiveConnection(): Promise<ConnectionRow> {
  const { data, error } = await db()
    .from("google_calendar_connections")
    .select("id, refresh_token_encrypted, access_token_encrypted, access_token_expires_at, token_status")
    .eq("singleton_key", "platform")
    .maybeSingle();

  if (error) {
    throw new AppError("Could not read the SIJIL Google Calendar connection", 500);
  }
  if (!data || data.token_status !== "active") {
    throw new AppError(
      "Google Calendar is not connected. A SIJIL administrator must connect Calendar before scheduling video interviews with Meet.",
      503,
    );
  }
  return data as ConnectionRow;
}

async function markNeedsReauth(connectionId: string): Promise<void> {
  await db()
    .from("google_calendar_connections")
    .update({
      token_status: "needs_reauth",
      updated_at: new Date().toISOString(),
    })
    .eq("id", connectionId);
}

async function refreshAccessToken(connection: ConnectionRow): Promise<string> {
  const config = requireGoogleCalendarOAuthConfig();
  let refreshToken: string;
  try {
    refreshToken = decryptSecret(connection.refresh_token_encrypted, config.encryptionKey);
  } catch {
    await markNeedsReauth(connection.id);
    throw new AppError("Google Calendar credentials are invalid. Reconnect Calendar as admin.", 503);
  }

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  let response: Response;
  try {
    response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch {
    throw new AppError("Could not reach Google to refresh Calendar access", 503);
  }

  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || typeof json.access_token !== "string") {
    const safe = redactSecretsForLog(JSON.stringify(json));
    console.error("[google-calendar-events] token refresh failed", {
      status: response.status,
      error: safe,
    });
    if (response.status === 400 || response.status === 401) {
      await markNeedsReauth(connection.id);
      throw new AppError("Google Calendar access expired. Reconnect Calendar as admin.", 503);
    }
    throw new AppError("Google Calendar token refresh failed", 503);
  }

  const accessToken = json.access_token;
  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : 3600;
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  await db()
    .from("google_calendar_connections")
    .update({
      access_token_encrypted: encryptSecret(accessToken, config.encryptionKey),
      access_token_expires_at: expiresAt,
      last_refreshed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      token_status: "active",
    })
    .eq("id", connection.id);

  return accessToken;
}

/** Returns a usable access token for the SIJIL Calendar owner. Never expose to clients. */
export async function getValidGoogleCalendarAccessToken(): Promise<string> {
  const config = requireGoogleCalendarOAuthConfig();
  const connection = await loadActiveConnection();

  const expiresAt = connection.access_token_expires_at
    ? Date.parse(connection.access_token_expires_at)
    : 0;
  const stillValid = Number.isFinite(expiresAt) && expiresAt - ACCESS_TOKEN_SKEW_MS > Date.now();

  if (stillValid && connection.access_token_encrypted) {
    try {
      return decryptSecret(connection.access_token_encrypted, config.encryptionKey);
    } catch {
      // Fall through to refresh.
    }
  }

  return refreshAccessToken(connection);
}

function endIsoFromStart(startIso: string, durationMinutes: number): string {
  const start = new Date(startIso);
  return new Date(start.getTime() + durationMinutes * 60_000).toISOString();
}

/**
 * Creates a Calendar event with a Google Meet conference on the SIJIL-owned calendar.
 */
export async function createGoogleMeetEvent(
  input: CreateMeetEventInput,
): Promise<CreateMeetEventResult> {
  const accessToken = await getValidGoogleCalendarAccessToken();
  const requestId = randomUUID();
  const timeZone = input.timeZone?.trim() || "UTC";
  const endIso = endIsoFromStart(input.startIso, input.durationMinutes);

  const body: Record<string, unknown> = {
    summary: input.summary,
    description: input.description || undefined,
    start: { dateTime: input.startIso, timeZone },
    end: { dateTime: endIso, timeZone },
    conferenceData: {
      createRequest: {
        requestId,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
  };

  if (input.attendeeEmail?.trim()) {
    body.attendees = [{ email: input.attendeeEmail.trim() }];
  }

  let response: Response;
  try {
    response = await fetch(`${CALENDAR_EVENTS_URL}?conferenceDataVersion=1`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AppError("Could not reach Google Calendar to create the Meet link", 503);
  }

  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const safe = redactSecretsForLog(JSON.stringify(json));
    console.error("[google-calendar-events] events.insert failed", {
      status: response.status,
      error: safe,
    });
    if (response.status === 401) {
      throw new AppError("Google Calendar authorization failed. Reconnect Calendar as admin.", 503);
    }
    throw new AppError("Could not create a Google Meet link for this interview", 503);
  }

  const eventId = typeof json.id === "string" ? json.id : null;
  const hangoutLink = typeof json.hangoutLink === "string" ? json.hangoutLink : null;
  const entryPoints = (json.conferenceData as { entryPoints?: Array<{ entryPointType?: string; uri?: string }> } | undefined)
    ?.entryPoints;
  const videoEntry = entryPoints?.find((e) => e.entryPointType === "video" && typeof e.uri === "string");
  const meetUrl = hangoutLink || videoEntry?.uri || null;
  const htmlLink = typeof json.htmlLink === "string" ? json.htmlLink : null;

  if (!eventId || !meetUrl) {
    if (eventId) {
      await deleteGoogleCalendarEventQuietly(eventId);
    }
    throw new AppError(
      "Google Calendar created an event without a Meet link. Check that Meet is enabled for the SIJIL Google account.",
      503,
    );
  }

  return { eventId, meetUrl, htmlLink };
}

export async function deleteGoogleCalendarEventQuietly(eventId: string): Promise<void> {
  if (!eventId.trim()) return;
  try {
    const accessToken = await getValidGoogleCalendarAccessToken();
    await fetch(`${CALENDAR_EVENTS_URL}/${encodeURIComponent(eventId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    // Best-effort cleanup only.
  }
}

/** Test helper: extract Meet URL from a Calendar API-shaped payload without network. */
export function extractMeetUrlFromEventPayload(payload: Record<string, unknown>): string | null {
  if (typeof payload.hangoutLink === "string" && payload.hangoutLink) return payload.hangoutLink;
  const entryPoints = (payload.conferenceData as { entryPoints?: Array<{ entryPointType?: string; uri?: string }> } | undefined)
    ?.entryPoints;
  const video = entryPoints?.find((e) => e.entryPointType === "video" && e.uri);
  return video?.uri ?? null;
}
