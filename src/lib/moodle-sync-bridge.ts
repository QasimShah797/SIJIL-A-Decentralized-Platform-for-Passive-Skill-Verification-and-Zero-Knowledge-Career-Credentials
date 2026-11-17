/**
 * Optional local bridge helpers (pure; no I/O).
 *
 * The public Moodle site is called by the hosted moodle-sync function.
 * The browser uses a local bridge only when Moodle itself is on a local
 * development host. A leftover VITE_MOODLE_SYNC_BRIDGE_URL must not force
 * every teammate to run a process on port 8787.
 */
import { parseMoodleSiteUrl } from "../../supabase/functions/moodle-sync/moodle-site-url.ts";

const LOCAL_BRIDGE_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
  "::1",
]);

export type MoodleSyncBridgeConfig = {
  enabled: boolean;
  url: string | null;
  error: string | null;
};

/**
 * Accept only loopback HTTP(S) bridge URLs so a mis-set env cannot point
 * the browser at an arbitrary remote ingest endpoint.
 */
export function parseMoodleSyncBridgeUrl(
  raw: string | null | undefined,
): { ok: true; url: string } | { ok: false; error: string } {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) {
    return { ok: false, error: "Moodle sync bridge URL is empty." };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: "Moodle sync bridge URL is not a valid URL." };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      ok: false,
      error: "Moodle sync bridge URL must use http or https.",
    };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!LOCAL_BRIDGE_HOSTS.has(hostname) && !hostname.endsWith(".localhost")) {
    return {
      ok: false,
      error:
        "Moodle sync bridge URL must target localhost / 127.0.0.1 (local bridge only).",
    };
  }

  // Normalize: strip trailing slash for fetch join consistency.
  const normalized = parsed.toString().replace(/\/+$/, "");
  return { ok: true, url: normalized };
}

export function resolveMoodleSyncBridgeConfig(
  envValue: string | null | undefined,
): MoodleSyncBridgeConfig {
  const trimmed = typeof envValue === "string" ? envValue.trim() : "";
  if (!trimmed) {
    return { enabled: false, url: null, error: null };
  }

  const parsed = parseMoodleSyncBridgeUrl(trimmed);
  if (parsed.ok === false) {
    return { enabled: false, url: null, error: parsed.error };
  }

  return { enabled: true, url: parsed.url, error: null };
}

export function isMoodleSyncBridgeEnabled(
  envValue: string | null | undefined = import.meta.env.VITE_MOODLE_SYNC_BRIDGE_URL,
  moodleSiteUrl?: string | null,
): boolean {
  return resolveMoodleSyncRoute(envValue, moodleSiteUrl).enabled;
}

/**
 * Public Moodle always uses the hosted function, even if a local bridge URL
 * is still set. The bridge is only for a Moodle site on this computer.
 */
export function resolveMoodleSyncRoute(
  bridgeEnv: string | null | undefined,
  moodleSiteUrl: string | null | undefined,
): MoodleSyncBridgeConfig {
  const site = moodleSiteUrl ? parseMoodleSiteUrl(moodleSiteUrl) : null;
  if (!site?.isLocalDevHost) {
    return { enabled: false, url: null, error: null };
  }
  return resolveMoodleSyncBridgeConfig(bridgeEnv);
}

export function moodleSyncBridgeUnreachableMessage(bridgeUrl: string): string {
  return (
    `Local Moodle sync bridge is unreachable at ${bridgeUrl}. ` +
    "That bridge is only used when Moodle is running on this computer. " +
    "For the public site, remove VITE_MOODLE_SYNC_BRIDGE_URL so sync uses the hosted moodle-sync function."
  );
}

export function moodleSyncBridgeMisconfiguredMessage(error: string): string {
  return (
    `Moodle sync bridge is misconfigured: ${error} ` +
    "Fix VITE_MOODLE_SYNC_BRIDGE_URL (loopback only) or remove it to use hosted Edge."
  );
}
