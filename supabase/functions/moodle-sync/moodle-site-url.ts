/**
 * Environment-driven Moodle site URL helpers (pure; no I/O / secrets).
 *
 * Concepts:
 * - MOODLE_BASE_URL: Edge runtime contact URL (may differ, e.g. host.docker.internal).
 * - MOODLE_EXPECTED_SITE_URL: canonical wwwroot expected from core_webservice_get_site_info.
 * - VITE_MOODLE_SITE_URL: frontend display/filter only (never a token).
 *
 * Request bodies must never choose the Moodle host.
 */

export const DEFAULT_MOODLE_CLOUD_SITE_URL = "https://sijil-fyp.moodlecloud.com";
export const LEGACY_MOODLE_CLOUD_HOST = "sijil.moodlecloud.com";
export const DEFAULT_MOODLE_CLOUD_HOST = "sijil-fyp.moodlecloud.com";

const LOCAL_HTTP_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
  "::1",
  "host.docker.internal",
]);

export type MoodleSiteUrlParts = {
  normalized: string;
  origin: string;
  host: string;
  hostname: string;
  protocol: "http:" | "https:";
  isLocalDevHost: boolean;
};

export function normalizeMoodleSiteUrl(url: string): string {
  return url.trim().replace(/\/+$/, "").toLowerCase();
}

function ensureAbsoluteUrl(url: string): string {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function parseMoodleSiteUrl(url: string): MoodleSiteUrlParts | null {
  try {
    const parsed = new URL(ensureAbsoluteUrl(url));
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    const hostname = parsed.hostname.toLowerCase();
    const host = parsed.host.toLowerCase();
    const isLocalDevHost =
      LOCAL_HTTP_HOSTS.has(hostname) ||
      hostname.endsWith(".localhost");
    return {
      normalized: normalizeMoodleSiteUrl(parsed.toString()),
      origin: parsed.origin.toLowerCase(),
      host,
      hostname,
      protocol: parsed.protocol,
      isLocalDevHost,
    };
  } catch {
    return null;
  }
}

/** Canonical compare key: origin only (ignores path/trailing slash). */
export function moodleSiteCompareKey(url: string): string | null {
  const parts = parseMoodleSiteUrl(url);
  return parts ? parts.origin : null;
}

export function moodleSiteUrlsMatch(left: string, right: string): boolean {
  const a = moodleSiteCompareKey(left);
  const b = moodleSiteCompareKey(right);
  if (!a || !b) return false;
  return a === b;
}

/**
 * HTTP is allowed only for explicitly local development hosts.
 * Remote cleartext Moodle hosts are rejected.
 */
export function assertMoodleUrlTransportPolicy(
  url: string,
  label: string,
): MoodleSiteUrlParts {
  const parts = parseMoodleSiteUrl(url);
  if (!parts) {
    throw new Error(`${label} is not a valid Moodle URL.`);
  }
  if (parts.protocol === "http:" && !parts.isLocalDevHost) {
    throw new Error(
      `${label} uses HTTP for a non-local host (${parts.host}). Use HTTPS, or configure a local development host.`,
    );
  }
  return parts;
}

export function resolveConfiguredMoodleSiteUrl(
  envValue: string | null | undefined,
  fallback: string = DEFAULT_MOODLE_CLOUD_SITE_URL,
): string {
  const raw = typeof envValue === "string" ? envValue.trim() : "";
  const candidate = raw || fallback;
  const parts = assertMoodleUrlTransportPolicy(candidate, "Moodle site URL");
  return parts.normalized;
}

export function resolveExpectedMoodleSiteUrlFromEnv(
  env: { MOODLE_EXPECTED_SITE_URL?: string | null } | Record<string, string | undefined>,
): string {
  return resolveConfiguredMoodleSiteUrl(
    env.MOODLE_EXPECTED_SITE_URL,
    DEFAULT_MOODLE_CLOUD_SITE_URL,
  );
}

export function assertActualMoodleSiteMatchesExpected(
  actualSiteUrl: string,
  expectedSiteUrl: string,
): string {
  const expected = assertMoodleUrlTransportPolicy(expectedSiteUrl, "MOODLE_EXPECTED_SITE_URL");
  const actualRaw = (actualSiteUrl || "").trim();
  if (!actualRaw) {
    throw new Error(
      `Moodle site identity missing from core_webservice_get_site_info (expected ${expected.normalized}).`,
    );
  }
  const actual = assertMoodleUrlTransportPolicy(actualRaw, "Moodle siteurl");
  if (!moodleSiteUrlsMatch(actual.normalized, expected.normalized)) {
    throw new Error(
      `Moodle token is connected to ${actual.normalized}, expected ${expected.normalized}.`,
    );
  }
  return actual.normalized;
}

/** Reject client/body attempts to supply a Moodle host. */
export function bodyAttemptsMoodleHostOverride(body: Record<string, unknown>): boolean {
  const keys = [
    "moodleSiteUrl",
    "moodle_site_url",
    "moodleBaseUrl",
    "moodle_base_url",
    "siteUrl",
    "site_url",
    "baseUrl",
    "base_url",
  ];
  return keys.some((key) => Object.prototype.hasOwnProperty.call(body, key));
}

export function isLegacyMoodleCloudHost(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  const parts = parseMoodleSiteUrl(url);
  const host = parts?.hostname ?? normalizeMoodleSiteUrl(url);
  return (
    host === LEGACY_MOODLE_CLOUD_HOST ||
    (host.includes("moodlecloud.com") && !host.includes("sijil-fyp"))
  );
}

export function isConfiguredMoodleSiteUrl(
  url: string | null | undefined,
  configuredSiteUrl: string,
): boolean {
  if (!url?.trim()) return false;
  return moodleSiteUrlsMatch(url, configuredSiteUrl);
}
