#!/usr/bin/env bash
# FR-APP-003 — offline/reconnect banner, orchestrated end to end on a real
# emulator: cut device connectivity with adb, assert the banner appears; restore,
# assert it clears. Maestro alone cannot toggle connectivity, so this script owns
# the network side and delegates UI assertions to two inline flows.
# @infra (the @satisfies annotation lives in the flow files it generates)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=tools/env.sh
source "$ROOT/tools/env.sh"
export PATH="$HOME/.maestro/bin:$PATH"

FLOWS="$ROOT/apps/mobile/e2e/flows"
TMP="$(mktemp -d)"
trap 'adb shell cmd connectivity airplane-mode disable >/dev/null 2>&1 || true; rm -rf "$TMP"' EXIT

# Precondition: signed in and on the shell (p1-01 ran before us).
cat > "$TMP/pre.yaml" <<'YAML'
appId: com.openchat.mobile
---
- launchApp
- assertVisible:
    id: 'shell-screen'
YAML
E2E=1 maestro test "$TMP/pre.yaml"

echo "=== cutting connectivity (airplane mode) ==="
adb shell cmd connectivity airplane-mode enable
cat > "$TMP/offline.yaml" <<'YAML'
# @satisfies FR-APP-003
appId: com.openchat.mobile
---
- extendedWaitUntil:
    visible:
      id: 'connection-banner'
    timeout: 15000
- takeScreenshot: artifacts/e2e/screens/p1-offline-banner
YAML
E2E=1 maestro test "$TMP/offline.yaml"
echo "  ✓ banner appeared while offline"

echo "=== restoring connectivity ==="
adb shell cmd connectivity airplane-mode disable
cat > "$TMP/online.yaml" <<'YAML'
# @satisfies FR-APP-003
appId: com.openchat.mobile
---
- extendedWaitUntil:
    notVisible:
      id: 'connection-banner'
    timeout: 60000
YAML
E2E=1 maestro test "$TMP/online.yaml"
echo "  ✓ banner cleared after reconnect"
echo "  ✓ FR-APP-003 offline/reconnect cycle proven on device"
