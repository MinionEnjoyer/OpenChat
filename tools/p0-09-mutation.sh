#!/usr/bin/env bash
# P0-09 provider contract mutation exercise
# Tests whether provider tests detect OpenAPI contract drift.
# Each mutation is applied to contracts/openapi.yaml only (never server code),
# provider suite is run, then reverted.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Verify clean contract first
ORIG_HASH=$(md5 -q contracts/openapi.yaml 2>/dev/null || md5sum contracts/openapi.yaml | cut -d' ' -f1)
echo "=== Contract mutations (original hash: $ORIG_HASH) ==="

cleanup() { cp "$ROOT/contracts/openapi.yaml.bak" "$ROOT/contracts/openapi.yaml" 2>/dev/null || true; }
trap cleanup EXIT

run_suite() {
  local label="$1"
  cd "$ROOT/apps/api"
  local result
  result=$(npx jest --config jest-contract.config.js --forceExit 2>&1)
  local rc=$?
  local summary
  summary=$(echo "$result" | grep -E "Tests:|Test Suites:" | tr '\n' ' ')
  cd "$ROOT"
  echo "  $label: $summary exit=$rc"
  if echo "$result" | grep -qE '✗|✕|● '; then
    echo "  FAILURES:"
    echo "$result" | grep -E '● ' | sed 's/^/    /' | head -8
  fi
}

# Backup
cp contracts/openapi.yaml contracts/openapi.yaml.bak

# ── MUT A: Change response field type (username: string → integer) ──
echo ""
echo "--- MUT A: change username from string to integer ---"
node -e "
let y=require('fs').readFileSync('contracts/openapi.yaml','utf8');
y=y.replace(/^(\s+username:\s*\n\s+type:\s+)string$/m,'\$1integer');
require('fs').writeFileSync('contracts/openapi.yaml',y);
"
run_suite "MUT A"

# Restore
cp contracts/openapi.yaml.bak contracts/openapi.yaml

# ── MUT B: Remove id field from /auth/me response ──
echo ""
echo "--- MUT B: remove id from /auth/me response ---"
node -e "
let y=require('fs').readFileSync('contracts/openapi.yaml','utf8');
let lines=y.split('\n'), in=false, i=0;
while(i<lines.length){if(lines[i].match(/^\s*\/auth\/me:/))in=true;
 else if(in&&lines[i].match(/^\s*\/(auth|servers|health|config|channels|notifications|friends|dms|\#)/))in=false;
 if(in&&lines[i].match(/^\s+id:/)){lines.splice(i,2);in=false;}i++;}
require('fs').writeFileSync('contracts/openapi.yaml',lines.join('\n'));
"
run_suite "MUT B"

# Restore
cp contracts/openapi.yaml.bak contracts/openapi.yaml

# ── MUT C: Add field not returned by server (email to /auth/me) ──
echo ""
echo "--- MUT C: add nonexistent email field to /auth/me ---"
node -e "
let y=require('fs').readFileSync('contracts/openapi.yaml','utf8');
let lines=y.split('\n'), in=false, i=0;
while(i<lines.length){if(lines[i].match(/^\s*\/auth\/me:/))in=true;
 else if(in&&lines[i].match(/^\s*\/(auth|servers|health|config|channels|notifications|friends|dms|\#)/))in=false;
 if(in&&lines[i].match(/^\s+username:/)){let ind=lines[i].match(/^(\s*)/)[1];lines.splice(i,0,ind+'email:',ind+'  type: string',ind+'  description: NOT_RETURNED_BY_SERVER');in=false;break;}i++;}
require('fs').writeFileSync('contracts/openapi.yaml',lines.join('\n'));
"
run_suite "MUT C"

# Restore
cp contracts/openapi.yaml.bak contracts/openapi.yaml

echo ""
echo "=== Done. If any MUT shows exit=0 with all tests passing, === "
echo "=== the provider suite does NOT validate against the contract. ==="