#!/usr/bin/env bash
# FR-MSG-002 two-client acceptance on a real device: alice's app sends a message
# (optimistic → ack), then bob posts via REST and alice's app must show it live
# over the gateway — no refresh, ≤5s. Maestro owns the UI; this script owns bob.
# @infra (the @satisfies annotations live in the generated flows)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=tools/env.sh
source "$ROOT/tools/env.sh"
export PATH="$HOME/.maestro/bin:$PATH"

API="http://localhost:3001/api"
CH=$(python3 -c "import json;print(json.load(open('$ROOT/tools/seed/fixture-ids.json'))['channels']['#general'])")
STAMP=$(date +%s)
ALICE_MSG="e2e-alice-$STAMP"
BOB_MSG="e2e-bob-$STAMP"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Part 1 — alice sends from the device; her own message renders (optimistic+ack).
cat > "$TMP/send.yaml" <<YAML
# @satisfies FR-MSG-002
appId: com.openchat.mobile
---
- launchApp
- assertVisible:
    id: 'shell-screen'
- scrollUntilVisible:
    element:
      id: 'rail-server-Fixture Guild'
    direction: DOWN
    timeout: 20000
- tapOn:
    id: 'rail-server-Fixture Guild'
- tapOn:
    id: 'channel-#general'
- tapOn:
    id: 'composer-input'
- inputText: '$ALICE_MSG'
- hideKeyboard
- tapOn:
    id: 'composer-send'
- extendedWaitUntil:
    visible: '$ALICE_MSG'
    timeout: 5000
YAML
E2E=1 maestro test "$TMP/send.yaml"
echo "  ✓ alice's optimistic send rendered"

# Part 2 — bob posts via REST while alice's app is foregrounded.
BOB_AT=$(curl -s -X POST "$API/auth/dev-login" -H 'content-type: application/json' -d '{"username":"bob"}' | python3 -c "import json,sys;print(json.load(sys.stdin)['accessToken'])")
curl -s -o /dev/null -X POST "$API/channels/$CH/messages" \
  -H "Authorization: Bearer $BOB_AT" -H 'content-type: application/json' \
  -d "{\"content\":\"$BOB_MSG\"}"
echo "  → bob posted via REST"

# Part 3 — alice's app shows bob's message without any refresh.
cat > "$TMP/receive.yaml" <<YAML
# @satisfies FR-MSG-002
appId: com.openchat.mobile
---
- extendedWaitUntil:
    visible: '$BOB_MSG'
    timeout: 5000
- takeScreenshot: artifacts/e2e/screens/p2-live-message
YAML
E2E=1 maestro test "$TMP/receive.yaml"
echo "  ✓ bob's REST message appeared live via the gateway (≤5s, no refresh)"
echo "  ✓ FR-MSG-002 two-client cycle proven on device"
