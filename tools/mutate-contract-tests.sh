#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

TEST_FILE="$ROOT/apps/api/test/contract/provider.spec.ts"
BAK="$TEST_FILE.bak"
cp "$TEST_FILE" "$BAK"
trap "cp $BAK $TEST_FILE 2>/dev/null || true" EXIT

run_suite() {
  local label="$1"
  cd "$ROOT/apps/api"
  local result rc
  set +e
  result=$(npx jest --config jest-contract.config.js --forceExit 2>&1)
  rc=$?
  set -e
  local summary
  summary=$(echo "$result" | grep -E "Tests:" | head -1)
  cd "$ROOT"
  echo "  $label: $summary exit=$rc"
  if [ "$rc" -ne 0 ]; then
    echo "  ✓ CAUGHT (nonzero exit)"
  else
    echo "  ✗ MISSED (exit 0) — gate failed to catch mutation"
  fi
}

# ── MUT A: Change User.username type from string to integer ──
echo "--- MUT A: username string → integer ---"
sed -i '' "s/username: { type: 'string' }/username: { type: 'integer' }/" "$TEST_FILE"
run_suite "MUT A"
cp "$BAK" "$TEST_FILE"

# ── MUT B: Remove id from User schema required array ──
echo "--- MUT B: remove 'id' from User required ---"
sed -i '' "s/required: \['id', 'username'\]/required: ['username']/" "$TEST_FILE"
run_suite "MUT B"
cp "$BAK" "$TEST_FILE"

# ── MUT C: Add an undocumented field to User schema ──
echo "--- MUT C: add 'secretBackdoor' field to User properties ---"
sed -i '' "/serverLayout: {}, \/\/ arbitrary JSON/a\\
    secretBackdoor: { type: 'string' }," "$TEST_FILE"
run_suite "MUT C"
cp "$BAK" "$TEST_FILE"

echo ""
echo "=== Done. All three mutations should show nonzero exit (CAUGHT). ==="