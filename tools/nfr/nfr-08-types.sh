#!/usr/bin/env bash
# NFR-08: type safety — tsc --strict zero errors, no `any` in apps/mobile/src
#
# Both halves are real as of P0-17: apps/mobile has a tsconfig (strict +
# noUncheckedIndexedAccess) and an eslint config carrying no-explicit-any.
# apps/api is checked too — it is the package Phase 1 starts modifying.
source "$(dirname "$0")/lib.sh"

NFR_ID="NFR-08"
NFR_NAME="type safety (tsc --strict, no any)"
NFR_BUDGET="tsc --strict zero errors; no \`any\` in apps/mobile/src"
NFR_ARM_AT_PHASE=1
NFR_TOOL="tsc --noEmit per package + eslint no-explicit-any"

count_ts_errors() {
  local dir="$1"
  set +e
  local out
  out=$(cd "$NFR_ROOT/$dir" && npx tsc --noEmit 2>&1)
  set -e
  printf '%s' "$out" | grep -c 'error TS' || true
}

api_errors=$(count_ts_errors apps/api)

mobile_tsconfig="$(nfr_mobile_tsconfig)"
if [ -n "$mobile_tsconfig" ]; then
  NFR_SCOPE_COMPLETE=true
  mobile_errors=$(count_ts_errors apps/mobile)
  # The no-any half of the requirement, checked by lint rather than the compiler.
  set +e
  any_hits=$(cd "$NFR_ROOT/apps/mobile" && npx eslint . --format unix 2>&1 | grep -c 'no-explicit-any')
  set -e
else
  NFR_SCOPE_COMPLETE=false
  NFR_SCOPE_PENDING="apps/mobile/src — no tsconfig.json yet"
  mobile_errors="n/a"
  any_hits=0
fi

total=$((api_errors + ${mobile_errors//n\/a/0} + any_hits))
if [ "$total" -eq 0 ]; then
  nfr_emit_armed "api 0 errors; mobile ${mobile_errors} errors; 0 explicit any" true \
    "$(nfr_evidence api_tsc_errors "$api_errors" mobile_tsc_errors "$mobile_errors" \
      explicit_any "$any_hits" mobile_tsconfig "${mobile_tsconfig:-absent}")"
else
  nfr_emit_armed "api ${api_errors} errors; mobile ${mobile_errors} errors; ${any_hits} explicit any" false \
    "$(nfr_evidence api_tsc_errors "$api_errors" mobile_tsc_errors "$mobile_errors" \
      explicit_any "$any_hits" mobile_tsconfig "${mobile_tsconfig:-absent}")"
fi
