#!/usr/bin/env bash
# Item 2 proof: break seed idempotency, run test, confirm it fails and names duplication
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== Step 1: Backup seed ==="
cp tools/seed/seed.mjs tools/seed/seed.mjs.bak

echo "=== Step 2: Break idempotency — make seed unconditionally create a channel ==="
# Comment out the guard that checks if channels already exist,
# so re-running always creates a duplicate
node -e '
const fs=require("fs");
const p="tools/seed/seed.mjs";
let y=fs.readFileSync(p,"utf8");
// Remove the conditional: "if (existing) { ... } else { create }"
// Make all text channels unconditionally POST-create
y=y.replace(
  /for \(const name of textChannelNames\) \{[\s\S]*?const key = name\.replace.*\n\s+const existing = channelList\.find.*\n\s+if \(existing\) \{[\s\S]*?\} else \{/m,
  "for (const name of textChannelNames) {\n    const key = name.replace('#', '\"'\"');\n    // [BROKEN IDEMPOTENCY: unconditional create]\n"
);
y=y.replace(
  /console\.log\(`  \$\{name\}: \$\{(existing \? existing\.id : ch\.body\.id)\} \(.*\)`\);/,
  ""
);
fs.writeFileSync(p,y);
console.log("  done - seed now always creates channels");
'

echo "=== Step 3: Run idempotency test ==="
bash tools/seed/test-idempotency.sh 2>&1
RC=$?

echo ""
echo "=== Step 4: Restore seed ==="
cp tools/seed/seed.mjs.bak tools/seed/seed.mjs
rm tools/seed/seed.mjs.bak

echo ""
echo "Exit code: $RC"
if [ $RC -ne 0 ]; then
  echo "✓ Idempotency test FAILED as expected — test catches the break"
else
  echo "✗ IDEMPOTENCY TEST PASSED — test did NOT catch the break!"
fi