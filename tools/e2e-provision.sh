#!/usr/bin/env bash
# e2e-provision.sh — shared provisioning for E2E runners.
#
# Source this file in e2e-run-only.sh or e2e-shard.sh, then call
# provision_world <label> to get Maestro-compatible env vars.
#
# After calling provision_world, the following shell vars are exported:
#   E2E_USERNAME E2E_USER_ID E2E_SERVER_NAME E2E_SERVER_ID
#   E2E_CHANNEL_GENERAL E2E_CHANNEL_GENERAL_ID
#   E2E_CHANNEL_VOICE E2E_CHANNEL_VOICE_ID
#   E2E_FRIEND_USERNAME E2E_FRIEND_USER_ID E2E_FRIEND_CODE
#   E2E_FRIEND_TOKEN E2E_DM_CHANNEL_ID
#   MAESTRO_ENV_ARGS — pre-built array of --env flags for maestro
#
# Usage:
#   source tools/e2e-provision.sh
#   provision_world "my-flow" || { echo "provision failed"; exit 1; }
#   maestro --device "$DEV" test "${MAESTRO_ENV_ARGS[@]}" "$f"
#
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

provision_world() {
  local label="${1:-flow}"
  local env_file
  env_file="/tmp/e2e-env-$label-$$.txt"

  # Call test-world.mjs — outputs KEY=VALUE lines to stdout
  node "$REPO_ROOT/tools/test-world.mjs" --label "$label" > "$env_file" 2>/tmp/e2e-provision-$label-$$.log
  local rc=$?
  if [ $rc -ne 0 ]; then
    echo "ERROR: test-world.mjs failed (rc=$rc). Log:"
    cat /tmp/e2e-provision-$label-$$.log
    return 1
  fi

  # Do NOT `source` this file. test-world.mjs emits real values, and a server
  # name legitimately contains spaces ("e2e srv <label>"). Sourcing
  #   E2E_SERVER_NAME=e2e srv foo
  # assigns "e2e" and then tries to RUN `srv foo`, which prints
  # "command not found" and leaves E2E_SERVER_NAME holding only the first word.
  # Flows then look for `rail-server-e2e` and never find it.
  #
  # Observed 2026-07-27: every cross-device pair failed with an empty server
  # name. The same corruption silently affected single-device flows whenever a
  # value contained whitespace.
  #
  # Assign explicitly instead, taking everything after the first '=' verbatim.
  MAESTRO_ENV_ARGS=()
  while IFS= read -r line; do
    case "$line" in
      ''|'#'*) continue ;;
      [A-Za-z_]*=*) ;;
      *) continue ;;   # ignore anything that is not a KEY=VALUE line
    esac
    key="${line%%=*}"
    value="${line#*=}"
    printf -v "$key" '%s' "$value"
    export "${key?}"
    MAESTRO_ENV_ARGS+=("--env" "${key}=${value}")
  done < "$env_file"

  rm -f "$env_file" /tmp/e2e-provision-$label-$$.log
  return 0
}
