#!/usr/bin/env bash
# NFR-06: outbound queue delivers offline-composed sends in order on reconnect
# Armed at Phase 2: the outbox ships with messaging core.
source "$(dirname "$0")/lib.sh"

NFR_ID="NFR-06"
NFR_NAME="outbound queue ordering on reconnect"
NFR_BUDGET="bounded 50; delivered in order on reconnect"
NFR_ARM_AT_PHASE=2
NFR_TOOL="integration test with WS chaos + ordered nonce assertion"
NFR_BLOCKED_BY="no outbox — Phase 2 (06 §6: FIFO per-channel queue surviving restart)"

nfr_stub "$(nfr_evidence \
  mobile_outbox_module "absent" \
  ws_gateway_characterized "apps/api/test/characterization/ws.spec.ts")"
