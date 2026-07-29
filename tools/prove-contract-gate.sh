#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Break the health test (always green, no auth needed) by expecting 999
cp "$ROOT/apps/api/test/contract/provider.spec.ts" "$ROOT/apps/api/test/contract/provider.spec.ts.bak"
sed -i '' 's/expect(r.status).toBe(200);$/\0 \/\/ HEALTH-BROKEN/' "$ROOT/apps/api/test/contract/provider.spec.ts"
# Replace just the first 200 with 999 after health comment inserted
sed -i '' '/HEALTH-BROKEN/s/\.toBe(200);/.toBe(999);/' "$ROOT/apps/api/test/contract/provider.spec.ts"

echo "=== Running devctl verify with deliberately broken contract test ==="
"$ROOT/tools/devctl" verify 2>&1; RC=$?
echo "=== EXIT CODE: $RC (expect nonzero) ==="

# Restore
cp "$ROOT/apps/api/test/contract/provider.spec.ts.bak" "$ROOT/apps/api/test/contract/provider.spec.ts"
rm "$ROOT/apps/api/test/contract/provider.spec.ts.bak"

if [ $RC -ne 0 ]; then
  echo "=== PASS: devctl verify caught the broken test (exit $RC) ==="
else
  echo "=== FAIL: devctl verify returned 0 despite broken test ==="
  exit 1
fi