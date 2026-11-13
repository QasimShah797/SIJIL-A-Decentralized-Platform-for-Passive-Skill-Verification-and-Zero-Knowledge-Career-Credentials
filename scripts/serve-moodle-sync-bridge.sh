#!/usr/bin/env bash
# Serve moodle-sync locally as the Local Moodle → Hosted Supabase bridge.
# Does not deploy Edge. Does not apply migrations. Requires Deno.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${MOODLE_BRIDGE_ENV_FILE:-$ROOT/env/bridge/moodle-sync.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE"
  echo "Copy env/bridge/moodle-sync.env.example → env/bridge/moodle-sync.env and fill placeholders."
  exit 1
fi

# Prefer explicit DENO_BIN, then PATH, then common local install (~/.deno/bin).
if [[ -z "${DENO_BIN:-}" ]]; then
  if command -v deno >/dev/null 2>&1; then
    DENO_BIN="$(command -v deno)"
  elif [[ -x "${HOME}/.deno/bin/deno" ]]; then
    DENO_BIN="${HOME}/.deno/bin/deno"
  else
    echo "Deno is required to serve the Moodle sync bridge."
    echo "Install: https://docs.deno.com/runtime/getting_started/installation/"
    exit 1
  fi
fi
export DENO_BIN

node "$ROOT/scripts/validate-bridge-moodle-env.mjs" "$ENV_FILE" || {
  echo "Fix bridge env validation errors before serving."
  exit 1
}

# shellcheck disable=SC1090
set -a
# Load KEY=VALUE lines (skip comments / blanks)
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ -z "${line// }" || "$line" =~ ^[[:space:]]*# ]] && continue
  export "$line"
done < "$ENV_FILE"
set +a

PORT="${MOODLE_SYNC_BRIDGE_PORT:-8787}"
export MOODLE_SYNC_BRIDGE_PORT="$PORT"

echo "Starting Moodle sync bridge on http://127.0.0.1:${PORT}"
echo "Moodle target: ${MOODLE_BASE_URL:-unset}"
echo "Supabase host: $(node -e 'try{console.log(new URL(process.env.SUPABASE_URL).hostname)}catch{console.log("invalid")}')"
echo "Press Ctrl+C to stop."

cd "$ROOT"
exec "$DENO_BIN" run \
  --allow-net \
  --allow-env \
  --allow-read \
  "$ROOT/supabase/functions/moodle-sync/index.ts"
