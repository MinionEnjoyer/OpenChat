#!/usr/bin/env bash
# NFR-01: cold start → interactive channel list ≤3.0s p95
# Armed at Phase 1: P1-06 puts a real channel drawer on screen, so the whole
# path this budget measures exists from then on.
source "$(dirname "$0")/lib.sh"

NFR_ID="NFR-01"
NFR_NAME="cold start to interactive channel list"
NFR_BUDGET="≤3.0s p95 on Pixel-6a-class emulator, release build"
NFR_ARM_AT_PHASE=1
NFR_TOOL="adb shell am start -W + reportFullyDrawn"
NFR_BLOCKED_BY="no APK and no channel list — P0-17 builds the skeleton, P1-06 the shell"

apk="$(nfr_apk_path)"
nfr_stub "$(nfr_evidence \
  apk_search "apps/mobile/**/*.apk" \
  apk_found "${apk:-none}")"
