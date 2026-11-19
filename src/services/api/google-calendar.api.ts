/**
 * Admin Google Calendar OAuth API (Phase 1).
 * Uses the shared authenticated client — never copies JWTs into the UI.
 */
import { apiRequest } from "./client";

export type GoogleCalendarStatus = {
  connected: boolean;
  googleEmail: string | null;
  tokenStatus: "active" | "needs_reauth" | "revoked" | null;
  connectedAt: string | null;
};

export type GoogleCalendarConnectResult = {
  authorizeUrl: string;
  expiresAt: string;
};

export async function getGoogleCalendarStatusApi(): Promise<GoogleCalendarStatus> {
  return apiRequest<GoogleCalendarStatus>("/integrations/google-calendar/status");
}

export async function startGoogleCalendarConnectApi(): Promise<GoogleCalendarConnectResult> {
  return apiRequest<GoogleCalendarConnectResult>("/integrations/google-calendar/connect");
}

export async function disconnectGoogleCalendarApi(): Promise<{ connected: boolean; googleEmail: null }> {
  return apiRequest<{ connected: boolean; googleEmail: null }>("/integrations/google-calendar/disconnect", {
    method: "DELETE",
  });
}
