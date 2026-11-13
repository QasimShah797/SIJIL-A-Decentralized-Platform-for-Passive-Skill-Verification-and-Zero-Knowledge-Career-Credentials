/**
 * Local Moodle → Hosted Supabase sync bridge helpers (pure; no I/O).
 *
 * Hosted Edge cannot reach WSL localhost:8000. The bridge runs moodle-sync
 * locally (Deno) with MOODLE_* pointing at local Moodle and SUPABASE_* at
 * hosted project nhzvtqpplfruzocframc. The browser must call that local
 * process — never the hosted Edge — when VITE_MOODLE_SYNC_BRIDGE_URL is set.
 */

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
): boolean {
  return resolveMoodleSyncBridgeConfig(envValue).enabled;
}

export function moodleSyncBridgeUnreachableMessage(bridgeUrl: string): string {
  return (
    `Local Moodle sync bridge is unreachable at ${bridgeUrl}. ` +
    "Start it with: npm run moodle:serve-bridge (local Moodle must be on :8000). " +
    "Hosted Edge cannot reach localhost Moodle — the bridge is required."
  );
}

export function moodleSyncBridgeMisconfiguredMessage(error: string): string {
  return (
    `Moodle sync bridge is misconfigured: ${error} ` +
    "Fix VITE_MOODLE_SYNC_BRIDGE_URL (loopback only) or remove it to use hosted Edge."
  );
}
