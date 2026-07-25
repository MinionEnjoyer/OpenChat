#!/usr/bin/env bash
# =============================================================================
# verify-worktree.sh — independent accept-gate for a worktree branch
#
# Bootstraps a worktree, starts its API, runs the full test and type-check
# suite, stops the API, and writes a machine-readable result.
#
# Usage:  tools/verify-worktree.sh <worktree-path> <port>
#
# Gates (all must pass):
#   1. Characterization suite: 11 suites / 89 tests, ALL PASS
#   2. Integration suite: ALL PASS
#   3. tsc --noEmit: clean
#   4. codegen --check: no drift
#
# Exit 0 only if every gate passes; non-zero otherwise.
# Output: artifacts/verify/<branch>.json
# =============================================================================
set -euo pipefail

WORKTREE="${1:?Usage: verify-worktree.sh <worktree-path> <port>}"
PORT="${2:?Usage: verify-worktree.sh <worktree-path> <port>}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

API_DIR="$WORKTREE/apps/api"
API_BASE="http://localhost:$PORT/api"
RESULT_DIR="$ROOT/artifacts/verify"
LOG_DIR="$ROOT/artifacts/verify/logs"

mkdir -p "$RESULT_DIR" "$LOG_DIR"

# ── Bootstrap ─────────────────────────────────────────────────────────
echo "=== verify-worktree ==="
echo "Worktree: $WORKTREE"
echo "Port:     $PORT"
echo ""

"$SCRIPT_DIR/worktree-up.sh" "$WORKTREE" "$PORT"

# ── Get branch name ───────────────────────────────────────────────────
BRANCH="$(cd "$WORKTREE" && git branch --show-current)"
echo "[verify] Branch: $BRANCH"

RESULT_FILE="$RESULT_DIR/${BRANCH}.json"
API_LOG="$LOG_DIR/${BRANCH}-api.log"
CHAR_LOG="$LOG_DIR/${BRANCH}-char.log"
INT_LOG="$LOG_DIR/${BRANCH}-integration.log"
TSC_LOG="$LOG_DIR/${BRANCH}-tsc.log"
CG_LOG="$LOG_DIR/${BRANCH}-codegen.log"

# Gate tracking
PASSED=0
FAILED=0
CHAR_PASS=false
CHAR_SUITES=0
CHAR_TESTS=0
INT_PASS=false
TSC_PASS=false
CG_PASS=false

# ── Start API ─────────────────────────────────────────────────────────
echo "[verify] Starting API on port $PORT..."
cd "$API_DIR"
PORT="$PORT" API_PORT="$PORT" npm run start:dev > "$API_LOG" 2>&1 &
API_PID=$!
cd "$ROOT"

# Cleanup trap — kill the API on exit
cleanup() {
  if [ -n "${API_PID:-}" ] && kill -0 "$API_PID" 2>/dev/null; then
    echo "[verify] Stopping API (pid $API_PID)..."
    kill "$API_PID" 2>/dev/null || true
    wait "$API_PID" 2>/dev/null || true
  fi
  # Also kill any children (nest start spawns a node process)
  if [ -n "${API_PID:-}" ]; then
    pkill -P "$API_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# ── Wait for health ───────────────────────────────────────────────────
echo "[verify] Waiting for $API_BASE/health..."
HEALTH_OK=false
for i in $(seq 1 60); do
  if curl -sf "$API_BASE/health" > /dev/null 2>&1; then
    HEALTH_OK=true
    echo "[verify] API healthy after ${i}s"
    break
  fi
  sleep 1
done

if [ "$HEALTH_OK" = false ]; then
  echo ""
  echo "=== FAIL: API did not become healthy after 60s ==="
  echo "=== API log tail ==="
  tail -80 "$API_LOG"
  exit 1
fi

# ════════════════════════════════════════════════════════════════════════
# Gate 1: Characterization
# ════════════════════════════════════════════════════════════════════════
echo ""
echo "--- Gate 1/4: characterization ---"
cd "$API_DIR"
set +e
CHAR_API_BASE="$API_BASE" npx jest --config jest-char.config.js --forceExit > "$CHAR_LOG" 2>&1
CHAR_RC=$?
set -e
cd "$ROOT"

cat "$CHAR_LOG"

# Parse counts from jest output (macOS-compatible: no grep -P)
CHAR_SUITES_TOTAL=$(grep -o 'Test Suites:.*total' "$CHAR_LOG" | grep -o '[0-9]\+ total' | grep -o '[0-9]\+' || echo "0")
CHAR_SUITES_PASSED=$(grep -o 'Test Suites:.*passed' "$CHAR_LOG" | grep -o '[0-9]\+ passed' | grep -o '[0-9]\+' || echo "0")
CHAR_TESTS_TOTAL=$(grep -o 'Tests:.*total' "$CHAR_LOG" | grep -o '[0-9]\+ total' | grep -o '[0-9]\+' || echo "0")
CHAR_TESTS_PASSED=$(grep -o 'Tests:.*passed' "$CHAR_LOG" | grep -o '[0-9]\+ passed' | grep -o '[0-9]\+' || echo "0")

CHAR_SUITES=$CHAR_SUITES_TOTAL
CHAR_TESTS=$CHAR_TESTS_TOTAL

echo ""
echo "[char-gate] Observed: $CHAR_SUITES_PASSED/$CHAR_SUITES_TOTAL suites, $CHAR_TESTS_PASSED/$CHAR_TESTS_TOTAL tests"

CHAR_FAIL_REASON=""
if [ "$CHAR_RC" -ne 0 ]; then
  CHAR_FAIL_REASON="jest exited $CHAR_RC"
elif [ "$CHAR_SUITES_TOTAL" -ne 11 ]; then
  CHAR_FAIL_REASON="expected 11 suites total, got $CHAR_SUITES_TOTAL (partial run?)"
elif [ "$CHAR_SUITES_PASSED" -ne 11 ]; then
  CHAR_FAIL_REASON="expected 11 suites passed, got $CHAR_SUITES_PASSED"
elif [ "$CHAR_TESTS_TOTAL" -ne 89 ]; then
  CHAR_FAIL_REASON="expected 89 tests total, got $CHAR_TESTS_TOTAL (partial run?)"
elif [ "$CHAR_TESTS_PASSED" -ne 89 ]; then
  CHAR_FAIL_REASON="expected 89 tests passed, got $CHAR_TESTS_PASSED"
fi

if [ -z "$CHAR_FAIL_REASON" ]; then
  echo "[verify] char: PASS"
  CHAR_PASS=true
  PASSED=$((PASSED + 1))
else
  echo "[verify] char: FAIL — $CHAR_FAIL_REASON"
  FAILED=$((FAILED + 1))
fi

# ════════════════════════════════════════════════════════════════════════
# Gate 2: Integration
# ════════════════════════════════════════════════════════════════════════
echo ""
echo "--- Gate 2/4: integration ---"
cd "$API_DIR"
set +e
CHAR_API_BASE="$API_BASE" npx jest --config jest-integration.config.js --forceExit > "$INT_LOG" 2>&1
INT_RC=$?
set -e
cd "$ROOT"

cat "$INT_LOG"

INT_FAILED_TESTS=$(grep -o 'Tests:.*failed' "$INT_LOG" | grep -o '[0-9]\+ failed' | grep -o '[0-9]\+' || echo "0")

if [ "$INT_RC" -ne 0 ] || [ "$INT_FAILED_TESTS" -ne 0 ]; then
  echo "[verify] integration: FAIL"
  FAILED=$((FAILED + 1))
else
  echo "[verify] integration: PASS"
  INT_PASS=true
  PASSED=$((PASSED + 1))
fi

# ════════════════════════════════════════════════════════════════════════
# Gate 3: tsc --noEmit
# ════════════════════════════════════════════════════════════════════════
echo ""
echo "--- Gate 3/4: tsc --noEmit ---"
cd "$API_DIR"
set +e
npx tsc --noEmit > "$TSC_LOG" 2>&1
TSC_RC=$?
set -e
cd "$ROOT"

if [ "$TSC_RC" -ne 0 ]; then
  echo "[verify] tsc: FAIL"
  echo "--- tsc errors ---"
  cat "$TSC_LOG"
  FAILED=$((FAILED + 1))
else
  echo "[verify] tsc: PASS"
  TSC_PASS=true
  PASSED=$((PASSED + 1))
fi

# ════════════════════════════════════════════════════════════════════════
# Gate 4: codegen --check
# ════════════════════════════════════════════════════════════════════════
echo ""
echo "--- Gate 4/4: codegen --check ---"
set +e
node "$ROOT/tools/codegen/gen.mjs" --check > "$CG_LOG" 2>&1
CG_RC=$?
set -e

cat "$CG_LOG"

if [ "$CG_RC" -ne 0 ]; then
  echo "[verify] codegen: FAIL"
  FAILED=$((FAILED + 1))
else
  echo "[verify] codegen: PASS"
  CG_PASS=true
  PASSED=$((PASSED + 1))
fi

# ════════════════════════════════════════════════════════════════════════
# Write machine-readable result
# ════════════════════════════════════════════════════════════════════════
CHAR_PASS_STR="false"
$CHAR_PASS && CHAR_PASS_STR="true"
INT_PASS_STR="false"
$INT_PASS && INT_PASS_STR="true"
TSC_PASS_STR="false"
$TSC_PASS && TSC_PASS_STR="true"
CG_PASS_STR="false"
$CG_PASS && CG_PASS_STR="true"

cat > "$RESULT_FILE" <<JSONEOF
{
  "branch": "$BRANCH",
  "port": $PORT,
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "all_passed": $(if [ "$FAILED" -eq 0 ]; then echo "true"; else echo "false"; fi),
  "gates": [
    {
      "name": "char",
      "pass": $CHAR_PASS_STR,
      "expected_suites": 11,
      "expected_tests": 89,
      "observed_suites": $CHAR_SUITES,
      "observed_tests": $CHAR_TESTS,
      "observed_suites_passed": $CHAR_SUITES_PASSED,
      "observed_tests_passed": $CHAR_TESTS_PASSED
    },
    {
      "name": "integration",
      "pass": $INT_PASS_STR
    },
    {
      "name": "tsc",
      "pass": $TSC_PASS_STR
    },
    {
      "name": "codegen",
      "pass": $CG_PASS_STR
    }
  ]
}
JSONEOF

echo ""
echo "[verify] Result written to $RESULT_FILE"

# ════════════════════════════════════════════════════════════════════════
# Summary
# ════════════════════════════════════════════════════════════════════════
echo ""
echo "=============================================="
echo "VERIFY SUMMARY: $BRANCH"
echo "  Passed: $PASSED / 4"
echo "  Failed: $FAILED / 4"
echo "=============================================="

if [ "$FAILED" -gt 0 ]; then
  exit 1
fi

exit 0
