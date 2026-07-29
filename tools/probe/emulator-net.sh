#!/usr/bin/env bash
# emulator-net.sh — deterministic emulator→host connectivity check (P0-17).
#
# Replaces e2e/flows/probe-net.yaml, which drove Chrome's UI to prove the same
# thing. That flow could not pass reproducibly: `clearState: true` resets Chrome
# to its FirstRunActivity every run, so its `assertVisible: "Chrome"` only ever
# succeeded on an emulator where first-run had already been dismissed by hand.
#
# What this asserts:
#   L3 — the emulator reaches the host loopback alias 10.0.2.2 (ping from device)
#   L7 — the API answers /api/health (from the host, where curl exists)
#
# The device image ships no curl, so a real L7 request *from* the device is not
# scriptable here. That proof was captured once in P0-15 (artifacts/e2e/net-probe.json,
# API log showing GET /api/health with Host: 10.0.2.2:3001) and is superseded
# permanently by Phase 1's first API-backed Maestro flow, which exercises the whole
# path from inside the app on every run.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=tools/env.sh
source "$ROOT/tools/env.sh"

HOST_ALIAS="${HOST_ALIAS:-10.0.2.2}"
API_PORT="${API_PORT:-3001}"
OUT="$ROOT/artifacts/e2e/netcheck.json"

fail() { echo "  ✗ $1"; exit 1; }

devices=$(adb devices 2>/dev/null | grep -cE '\sdevice$' || true)
[ "$devices" -ge 1 ] || fail "no emulator connected (run: devctl device up)"

# ── L3: device → host ──
if adb shell "ping -c 1 -W 2 $HOST_ALIAS" > /tmp/netcheck-ping.txt 2>&1; then
  loss=$(grep -oE '[0-9]+% packet loss' /tmp/netcheck-ping.txt | head -n1)
  echo "  ✓ L3: emulator reaches $HOST_ALIAS ($loss)"
else
  cat /tmp/netcheck-ping.txt
  fail "L3: emulator cannot reach $HOST_ALIAS"
fi

# ── L7: API answering on the host ──
code=$(curl -s -m 5 -o /tmp/netcheck-health.json -w '%{http_code}' \
  "http://localhost:$API_PORT/api/health" || echo "000")
[ "$code" = "200" ] || fail "L7: GET /api/health from host returned $code (is the stack up?)"
echo "  ✓ L7: GET /api/health → 200 $(tr -d '\n' < /tmp/netcheck-health.json)"

mkdir -p "$(dirname "$OUT")"
cat > "$OUT" <<JSON
{
  "checkedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "tool": "tools/probe/emulator-net.sh",
  "l3_device_to_host": {"target": "$HOST_ALIAS", "result": "reachable", "detail": "$loss"},
  "l7_api_from_host": {"url": "http://localhost:$API_PORT/api/health", "status": 200},
  "note": "L7-from-device was proven once in P0-15 (artifacts/e2e/net-probe.json); the device image has no curl, so it is not re-run here. Phase 1 API-backed flows supersede this check."
}
JSON
echo "  ✓ netcheck: artifacts/e2e/netcheck.json written"
