#!/usr/bin/env node
/**
 * Rejects hosted Supabase URLs / non-local Moodle targets before Moodle sync.
 * Read-only validation of env/local/*.env (or paths passed as args).
 *
 * Usage:
 *   node scripts/validate-local-moodle-env.mjs
 *   node scripts/validate-local-moodle-env.mjs env/local/frontend.env env/local/moodle-sync.env
 *
 * Exit 0 = safe local-only URLs. Exit 1 = blocked.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const DEFAULT_FILES = [
  "env/local/frontend.env",
  "env/local/moodle-sync.env",
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

function isHostedSupabaseUrl(value) {
  if (!value) return false;
  const lower = value.toLowerCase();
  return lower.includes("supabase.co") || lower.includes("supabase.in");
}

function isLocalSupabaseApiUrl(value) {
  if (!value) return false;
  try {
    const u = new URL(value);
    const host = u.hostname.toLowerCase();
    const localHost =
      host === "127.0.0.1" || host === "localhost" || host === "[::1]";
    return localHost && (u.port === "54321" || u.port === "");
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
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "host.docker.internal" ||
      host === "[::1]"
    );
  } catch {
    return false;
  }
}

function looksLikePlaceholder(value) {
  return !value || /placeholder/i.test(value) || /^<.*>$/.test(value.trim());
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
    errors.push(`Missing env file: ${file}`);
    continue;
  }
  const env = parseEnv(readFileSync(file, "utf8"));
  const label = file.replace(ROOT + "/", "");

  for (const [key, value] of Object.entries(env)) {
    if (/url|key|token|secret/i.test(key) && isHostedSupabaseUrl(value)) {
      errors.push(`${label}: ${key} points at hosted Supabase (${value})`);
    }
  }

  if ("VITE_SUPABASE_URL" in env) {
    if (!isLocalSupabaseApiUrl(env.VITE_SUPABASE_URL)) {
      errors.push(
        `${label}: VITE_SUPABASE_URL must be local http://127.0.0.1:54321 (got ${env.VITE_SUPABASE_URL || "(empty)"})`,
      );
    }
    if (looksLikePlaceholder(env.VITE_SUPABASE_ANON_KEY)) {
      warnings.push(
        `${label}: VITE_SUPABASE_ANON_KEY is still a placeholder (fill after supabase start)`,
      );
    }
  }

  if ("VITE_MOODLE_SITE_URL" in env && !isLocalMoodleUrl(env.VITE_MOODLE_SITE_URL)) {
    errors.push(
      `${label}: VITE_MOODLE_SITE_URL must be a local Moodle host (got ${env.VITE_MOODLE_SITE_URL})`,
    );
  }

  if ("SUPABASE_URL" in env) {
    if (!isLocalSupabaseApiUrl(env.SUPABASE_URL)) {
      errors.push(
        `${label}: SUPABASE_URL must be local http://127.0.0.1:54321 (got ${env.SUPABASE_URL || "(empty)"})`,
      );
    }
    if (looksLikePlaceholder(env.SUPABASE_ANON_KEY)) {
      warnings.push(`${label}: SUPABASE_ANON_KEY is still a placeholder`);
    }
    if (looksLikePlaceholder(env.SUPABASE_SERVICE_ROLE_KEY)) {
      warnings.push(`${label}: SUPABASE_SERVICE_ROLE_KEY is still a placeholder`);
    }
  }

  if ("MOODLE_EXPECTED_SITE_URL" in env && !isLocalMoodleUrl(env.MOODLE_EXPECTED_SITE_URL)) {
    errors.push(
      `${label}: MOODLE_EXPECTED_SITE_URL must be local (got ${env.MOODLE_EXPECTED_SITE_URL})`,
    );
  }
  if ("MOODLE_BASE_URL" in env && !isLocalMoodleUrl(env.MOODLE_BASE_URL)) {
    errors.push(
      `${label}: MOODLE_BASE_URL must be local / host.docker.internal (got ${env.MOODLE_BASE_URL})`,
    );
  }
  if ("MOODLE_TOKEN" in env && looksLikePlaceholder(env.MOODLE_TOKEN)) {
    warnings.push(`${label}: MOODLE_TOKEN is still a placeholder`);
  }
  if ("MOODLE_TOKEN" in env && env.MOODLE_TOKEN && isHostedSupabaseUrl(env.MOODLE_TOKEN)) {
    errors.push(`${label}: MOODLE_TOKEN value looks invalid / hosted-related`);
  }
}

if (warnings.length) {
  console.warn("Warnings (OK for preparation; fill before sync):");
  for (const w of warnings) console.warn(`  - ${w}`);
}

if (errors.length) {
  console.error("BLOCKED: local-only Moodle env validation failed:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log("OK: local-only URL checks passed (no *.supabase.co targets).");
if (warnings.length) {
  console.log("Note: placeholders remain — replace after supabase start / local Moodle token.");
}
process.exit(0);
