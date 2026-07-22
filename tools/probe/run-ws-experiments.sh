#!/usr/bin/env bash
# P0-03 — WS experiments E2, E3, E7 (runs using the node probe)
set -euo pipefail

cd "$(dirname "$0")/../.."
echo "=== E2: WS handshake + subscribe semantics ==="
node tools/probe/ws-probe.mjs E2 2>&1
echo ""
echo "=== E3: REST mutation → bus event matrix ==="
node tools/probe/ws-probe.mjs E3 2>&1
echo ""
echo "=== E7: Reactions/pins/polls/read events ==="
node tools/probe/ws-probe.mjs E7 2>&1
echo ""
echo "All WS experiments complete."