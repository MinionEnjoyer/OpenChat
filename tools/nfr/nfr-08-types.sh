#!/usr/bin/env bash
# NFR-08: type safety — tsc --strict zero errors, no `any` in apps/mobile/src
#
# The requirement's subject is apps/mobile/src, which does not exist as a TS
# project yet (no tsconfig.json). What exists today is apps/api, which we start
# modifying at P1-01, so the check is armed over that and the missing half of
# the scope is declared mechanically rather than in prose: scope_complete=false
# means the ratchet still fires at ARM_AT_PHASE.
source "$(dirname "$0")/lib.sh"

NFR_ID="NFR-08"
NFR_NAME="type safety (tsc --strict, no any)"
NFR_BUDGET="tsc --strict zero errors; no \`any\` in apps/mobile/src"
NFR_ARM_AT_PHASE=1
NFR_TOOL="tsc --noEmit per package + eslint no-explicit-any"

mobile_tsconfig="$(nfr_mobile_tsconfig)"
if [ -n "$mobile_tsconfig" ]; then
  NFR_SCOPE_COMPLETE=true
  NFR_SCOPE_PENDING=""
else
  NFR_SCOPE_COMPLETE=false
  NFR_SCOPE_PENDING="apps/mobile/src — no tsconfig.json yet (P0-17); no-any lint rule not yet enforceable"
fi

set +e
api_errors="$(cd "$NFR_ROOT/apps/api" && npx tsc --noEmit 2>&1)"
api_rc=$?
set -e
api_error_count="$(printf '%s' "$api_errors" | grep -c 'error TS' || true)"

if [ "$api_rc" -eq 0 ]; then
  nfr_emit_armed "apps/api: 0 tsc errors" true "$(nfr_evidence \
    checked "apps/api (tsc --noEmit)" \
    mobile_tsconfig "${mobile_tsconfig:-absent}" \
    mobile_src_files "$(nfr_mobile_src_files)")"
else
  nfr_emit_armed "apps/api: ${api_error_count} tsc error(s) (exit ${api_rc})" false "$(nfr_evidence \
    checked "apps/api (tsc --noEmit)" \
    first_error "$(printf '%s' "$api_errors" | grep 'error TS' | head -n1)" \
    mobile_tsconfig "${mobile_tsconfig:-absent}")"
fi
