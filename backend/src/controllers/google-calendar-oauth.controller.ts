/**
 * Admin-only Google Calendar OAuth endpoints (Phase 1).
 */
import { Request, Response } from "express";
import { sendSuccess } from "../utils/apiResponse";
import { AppError } from "../utils/AppError";
import {
  buildFrontendRedirect,
  completeAdminConnectCallback,
  createAdminConnectAuthorization,
  disconnectGoogleCalendarConnection,
  getGoogleCalendarConnectionStatus,
} from "../services/google-calendar-oauth.service";

function requireAdminUserId(req: Request): string {
  const id = req.user?.id;
  if (!id) throw new AppError("Authentication required", 401);
  return id;
}

/** GET /api/integrations/google-calendar/connect */
export async function startGoogleCalendarConnect(req: Request, res: Response) {
  const adminUserId = requireAdminUserId(req);
  const result = await createAdminConnectAuthorization(adminUserId);
  return sendSuccess(res, {
    authorizeUrl: result.authorizeUrl,
    expiresAt: result.expiresAt,
  }, "Google Calendar authorization ready");
}

/** GET /api/integrations/google-calendar/callback — browser redirect from Google (no JWT). */
export async function googleCalendarOAuthCallback(req: Request, res: Response) {
  const code = typeof req.query.code === "string" ? req.query.code : null;
  const state = typeof req.query.state === "string" ? req.query.state : null;
  const oauthError = typeof req.query.error === "string" ? req.query.error : null;

  try {
    const result = await completeAdminConnectCallback({ code, state, oauthError });
    const redirectTo = buildFrontendRedirect("success");
    // Avoid reflecting Google email in the URL query string.
    void result;
    return res.redirect(302, redirectTo);
  } catch (err) {
    const message = err instanceof AppError ? err.message : "Google Calendar connect failed";
    const reason = message.replace(/[^a-zA-Z0-9 _.-]/g, "").slice(0, 80) || "connect_failed";
    return res.redirect(302, buildFrontendRedirect("error", reason));
  }
}

/** GET /api/integrations/google-calendar/status */
export async function googleCalendarConnectionStatus(req: Request, res: Response) {
  requireAdminUserId(req);
  const status = await getGoogleCalendarConnectionStatus();
  return sendSuccess(res, {
    connected: status.connected,
    googleEmail: status.googleEmail,
    tokenStatus: status.tokenStatus,
    connectedAt: status.connectedAt,
  }, status.connected ? "Connected" : "Not connected");
}

/** DELETE /api/integrations/google-calendar/disconnect */
export async function disconnectGoogleCalendar(req: Request, res: Response) {
  requireAdminUserId(req);
  await disconnectGoogleCalendarConnection();
  return sendSuccess(res, { connected: false, googleEmail: null }, "Disconnected");
}
