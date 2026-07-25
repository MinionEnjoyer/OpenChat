#!/usr/bin/env bash
# NFR-07: reconnect storm safety — backoff 1s→32s + jitter, idempotent resubscribe
# Armed at Phase 1: P1-05 builds the gateway client and its backoff schedule.
source "$(dirname "$0")/lib.sh"

NFR_ID="NFR-07"
NFR_NAME="reconnect backoff and idempotent resubscribe"
NFR_BUDGET="exponential 1s→32s with jitter; resubscribe idempotent"
NFR_ARM_AT_PHASE=1
NFR_TOOL="unit test on the backoff schedule table + chaos test killing WS 20×"
NFR_BLOCKED_BY="no gateway client — P1-05 builds the reconnect loop"

nfr_stub "$(nfr_evidence \
  mobile_realtime_dir "$(ls "$NFR_ROOT/apps/mobile/src/realtime" 2>/dev/null | tr '\n' ' ')" \
  note "generated event types only; no client implementation")"
