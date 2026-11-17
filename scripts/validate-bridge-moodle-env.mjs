#!/usr/bin/env node
/**
 * Validates Moodle sync bridge env files.
 * Modes:
 *   - hosted-bridge: local Moodle → hosted *.supabase.co
 *   - local-full: local Moodle → local loopback Supabase (127.0.0.1 / localhost)
 * Read-only. Does not sync or write DB rows.
 *
 * Usage:
 *   node scripts/validate-bridge-moodle-env.mjs
 *   node scripts/validate-bridge-moodle-env.mjs env/bridge/frontend.env env/bridge/moodle-sync.env
 *
 * Exit 0 = shape OK (placeholders may remain as warnings).
 * Exit 1 = blocked (wrong host classes / non-loopback bridge).
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const DEFAULT_FILES = [
  "env/bridge/frontend.env",
  "env/bridge/moodle-sync.env",
];

function parseEnv(text) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function looksLikePlaceholder(value) {
  return !value || /placeholder/i.test(value) || /^<.*>$/.test(value.trim());
}

function isHostedSupabaseUrl(value) {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.hostname.toLowerCase().endsWith(".supabase.co")
      || u.hostname.toLowerCase().endsWith(".supabase.in");
  } catch {
    return false;
  }
}

function isLocalSupabaseUrl(value) {
  if (!value) return false;
  try {
    const u = new URL(value);
    const host = u.hostname.toLowerCase();
    return (
      (u.protocol === "http:" || u.protocol === "https:")
      && (host === "localhost" || host === "127.0.0.1" || host === "[::1]")
    );
  } catch {
    return false;
  }
}

function isAllowedMoodleUrl(value) {
  if (isLocalMoodleUrl(value)) return true;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isLocalMoodleUrl(value) {
  if (!value) return false;
  try {
    const u = new URL(value);
    const host = u.hostname.toLowerCase();
    return (
      host === "localhost"
      || host === "127.0.0.1"
      || host === "host.docker.internal"
      || host === "[::1]"
    );
  } catch {
    return false;
  }
}

function isLoopbackBridgeUrl(value) {
  if (!value) return false;
  try {
    const u = new URL(value);
    const host = u.hostname.toLowerCase();
    return (
      (u.protocol === "http:" || u.protocol === "https:")
      && (host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".localhost"))
    );
  } catch {
    return false;
  }
}

const files = (process.argv.slice(2).length
  ? process.argv.slice(2)
  : DEFAULT_FILES
).map((p) => resolve(ROOT, p));

/** @type {string[]} */
const errors = [];
/** @type {string[]} */
const warnings = [];

for (const file of files) {
  if (!existsSync(file)) {
    // Examples alone are OK for prep; working copies may be missing.
    if (file.endsWith(".example")) {
      errors.push(`Missing example file: ${file}`);
    } else {
      warnings.push(
        `Missing working env (copy from *.example): ${file.replace(ROOT + "/", "")}`,
      );
    }
    continue;
  }

  const env = parseEnv(readFileSync(file, "utf8"));
  const label = file.replace(ROOT + "/", "");

  if ("VITE_MOODLE_SITE_URL" in env && !isAllowedMoodleUrl(env.VITE_MOODLE_SITE_URL)) {
    errors.push(
      `${label}: VITE_MOODLE_SITE_URL must be HTTPS or a local Moodle host (got ${env.VITE_MOODLE_SITE_URL})`,
    );
  }

  if ("VITE_MOODLE_SYNC_BRIDGE_URL" in env) {
    if (!isLoopbackBridgeUrl(env.VITE_MOODLE_SYNC_BRIDGE_URL)) {
      errors.push(
        `${label}: VITE_MOODLE_SYNC_BRIDGE_URL must be loopback http(s) (got ${env.VITE_MOODLE_SYNC_BRIDGE_URL})`,
      );
    }
  }

  // Reject accidental VITE_* secrets
  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith("VITE_")) continue;
    if (/token|secret|service_role/i.test(key) && value) {
      errors.push(`${label}: ${key} must never carry tokens/secrets`);
    }
  }

  if ("SUPABASE_URL" in env) {
    const hosted = isHostedSupabaseUrl(env.SUPABASE_URL);
    const local = isLocalSupabaseUrl(env.SUPABASE_URL);
    if (!hosted && !local) {
      errors.push(
        `${label}: bridge SUPABASE_URL must be hosted *.supabase.co or local loopback (got ${env.SUPABASE_URL || "(empty)"})`,
      );
    }
    if (hosted && !String(env.SUPABASE_URL).includes("nhzvtqpplfruzocframc")) {
      warnings.push(
        `${label}: hosted SUPABASE_URL host is not the expected project ref nhzvtqpplfruzocframc`,
      );
    }
    if (local) {
      warnings.push(
        `${label}: local-full mode (loopback Supabase) — no hosted writes`,
      );
    }
    if (looksLikePlaceholder(env.SUPABASE_ANON_KEY)) {
      warnings.push(`${label}: SUPABASE_ANON_KEY is still a placeholder`);
    }
    if (looksLikePlaceholder(env.SUPABASE_SERVICE_ROLE_KEY)) {
      warnings.push(`${label}: SUPABASE_SERVICE_ROLE_KEY is still a placeholder`);
    }
  }

  if ("MOODLE_EXPECTED_SITE_URL" in env && !isAllowedMoodleUrl(env.MOODLE_EXPECTED_SITE_URL)) {
    errors.push(
      `${label}: MOODLE_EXPECTED_SITE_URL must be HTTPS or local (got ${env.MOODLE_EXPECTED_SITE_URL})`,
    );
  }
  if ("MOODLE_BASE_URL" in env && !isAllowedMoodleUrl(env.MOODLE_BASE_URL)) {
    errors.push(
      `${label}: MOODLE_BASE_URL must be HTTPS or a local / host.docker.internal host (got ${env.MOODLE_BASE_URL})`,
    );
  }
  if ("MOODLE_TOKEN" in env && looksLikePlaceholder(env.MOODLE_TOKEN)) {
    warnings.push(`${label}: MOODLE_TOKEN is still a placeholder`);
  }
}

if (warnings.length) {
  console.warn("Warnings:");
  for (const w of warnings) console.warn(`  - ${w}`);
}

if (errors.length) {
  console.error("BLOCKED: bridge Moodle env validation failed:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  "OK: bridge env shape checks passed (HTTPS or local Moodle + hosted or local Supabase + loopback bridge URL).",
);
if (warnings.length) {
  console.log("Note: review warnings before syncing.");
}
process.exit(0);
