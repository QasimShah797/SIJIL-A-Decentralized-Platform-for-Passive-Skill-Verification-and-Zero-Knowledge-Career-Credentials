/**
 * Pure Moodle sync HTTP security helpers (no Deno / Moodle / Supabase I/O).
 *
 * CORS: browser Origin must match an allowlist (never `*`). Auth remains
 * required for every action; CORS only gates which frontends may call.
 */

/** Local Vite / common FE origins for the Moodle sync bridge. */
export const DEFAULT_MOODLE_SYNC_CORS_ORIGINS = [
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
] as const;

/**
 * Parse comma-separated CORS allowlist. Empty / whitespace-only entries dropped.
 * Falls back to DEFAULT_MOODLE_SYNC_CORS_ORIGINS when raw is empty.
 */
export function parseMoodleSyncCorsOrigins(
  raw: string | null | undefined,
  fallback: readonly string[] = DEFAULT_MOODLE_SYNC_CORS_ORIGINS,
): string[] {
  const parsed = String(raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : [...fallback];
}

/**
 * Resolve Access-Control-Allow-Origin for a request Origin.
 * Returns null when Origin is missing or not allowlisted (browser will block).
 */
export function resolveMoodleSyncCorsAllowOrigin(
  requestOrigin: string | null | undefined,
  allowedOrigins: readonly string[],
): string | null {
  const origin = String(requestOrigin ?? "").trim();
  if (!origin) return null;
  return allowedOrigins.includes(origin) ? origin : null;
}

/** Build CORS response headers for OPTIONS / JSON responses. */
export function buildMoodleSyncCorsHeaders(
  requestOrigin: string | null | undefined,
  allowedOriginsRaw?: string | null,
): Record<string, string> {
  const allowed = parseMoodleSyncCorsOrigins(allowedOriginsRaw);
  const allowOrigin = resolveMoodleSyncCorsAllowOrigin(requestOrigin, allowed);
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
  if (allowOrigin) {
    headers["Access-Control-Allow-Origin"] = allowOrigin;
  }
  return headers;
}

export const MOODLE_SYNC_FUNCTION_VERSION = "3.4.0";

/** Actions that remain callable after authentication. */
export const ACTIVE_MOODLE_SYNC_ACTIONS = [
  "test",
  "sync_activities",
  "sync_moodle_data",
  "repair_moodle_evidence_records",
] as const;

/** Former debug proxies — recognized only to return HTTP 410 (no Moodle calls). */
export const DISABLED_MOODLE_DEBUG_ACTIONS = [
  "get_courses",
  "find_user_by_email",
  "get_user_courses",
  "get_completion",
  "get_grades",
] as const;

export type ActiveMoodleSyncAction = (typeof ACTIVE_MOODLE_SYNC_ACTIONS)[number];
export type DisabledMoodleDebugAction = (typeof DISABLED_MOODLE_DEBUG_ACTIONS)[number];

const DISABLED_SET = new Set<string>(DISABLED_MOODLE_DEBUG_ACTIONS);

export function normalizeMoodleSyncAction(raw: unknown): string {
  const s = String(raw ?? "").trim().toLowerCase().replace(/-/g, "_");
  if (s === "sync_moodle_data" || s === "refresh_moodle_data") {
    return "sync_moodle_data";
  }
  if (
    s === "repair_moodle_evidence"
    || s === "repair_moodle_evidence_records"
    || s === "repair_moodle_evidence_mapping"
  ) {
    return "repair_moodle_evidence_records";
  }
  if (
    s === "sync"
    || s === "sync_moodle"
    || s === "sync_moodle_activities"
    || s === "syncactivities"
    || s === "sync_activities"
  ) {
    return "sync_activities";
  }
  return s;
}

export function isDisabledMoodleDebugAction(action: string): boolean {
  return DISABLED_SET.has(action);
}

export function isActiveMoodleSyncAction(action: string): action is ActiveMoodleSyncAction {
  return (ACTIVE_MOODLE_SYNC_ACTIONS as readonly string[]).includes(action);
}

/**
 * Identity for Moodle sync must come only from the verified JWT user.
 * These body keys must never override authenticated userId / email.
 */
export const REJECTED_IDENTITY_BODY_KEYS = [
  "userId",
  "user_id",
  "authEmail",
  "auth_email",
  "email",
  "sijilEmail",
  "sijil_email",
] as const;

export function bodyAttemptsIdentityOverride(body: Record<string, unknown>): boolean {
  return REJECTED_IDENTITY_BODY_KEYS.some((key) => Object.prototype.hasOwnProperty.call(body, key));
}

/** Safe `test` payload — never includes token or env secret metadata. */
export function buildSafeMoodleTestResponse(params: {
  siteInfo: Record<string, unknown> | null;
  functionVersion?: string;
}): Record<string, unknown> {
  const siteInfo = params.siteInfo ?? {};
  const sitename =
    typeof siteInfo.sitename === "string"
      ? siteInfo.sitename
      : typeof siteInfo.sitefullname === "string"
        ? siteInfo.sitefullname
        : null;

  return {
    success: true,
    ok: true,
    authenticated: true,
    sitename,
    // Minimal nested shape for existing FE clients (sitename only).
    siteInfo: { sitename },
    functionVersion: params.functionVersion ?? MOODLE_SYNC_FUNCTION_VERSION,
    supportedActions: [...ACTIVE_MOODLE_SYNC_ACTIONS],
  };
}

export function disabledDebugActionPayload(action: string): Record<string, unknown> {
  return {
    error: "This Moodle debug action has been permanently disabled.",
    code: "ACTION_GONE",
    action,
    supportedActions: [...ACTIVE_MOODLE_SYNC_ACTIONS],
    functionVersion: MOODLE_SYNC_FUNCTION_VERSION,
    hint: "Use authenticated actions: test, sync_activities, sync_moodle_data, repair_moodle_evidence_records.",
  };
}

export function responseContainsSecretMetadata(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const text = JSON.stringify(payload).toLowerCase();
  const forbidden = [
    "moodle_token",
    "moodleenv",
    "tokenexists",
    "tokenlength",
    "service_role",
    "wstoken",
    "\"token\":",
  ];
  return forbidden.some((needle) => text.includes(needle));
}

/**
 * Moodle REST permission failures that should soft-fail (tryCallMoodle → accessDenied)
 * rather than abort the whole sync as MOODLE_API_UNAVAILABLE.
 */
export function isAccessControlError(message: string, errorcode?: string): boolean {
  const m = message.toLowerCase();
  const code = (errorcode ?? "").toLowerCase();
  return (
    code.includes("accessexception") ||
    code === "accessdenied" ||
    code === "nopermissiontoviewgrades" ||
    code.includes("nopermission") ||
    m.includes("access control exception") ||
    m.includes("access denied") ||
    m.includes("not allowed") ||
    m.includes("cannot view grades") ||
    m.includes("no permission")
  );
}
