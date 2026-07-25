#!/usr/bin/env bash
# NFR-03: release APK ≤60MB, JS bundle ≤12MB
# Armed at Phase 1: the first release build makes both numbers measurable.
source "$(dirname "$0")/lib.sh"

NFR_ID="NFR-03"
NFR_NAME="release APK size"
NFR_BUDGET="≤60MB APK, ≤12MB JS bundle"
NFR_ARM_AT_PHASE=1
NFR_TOOL="stat on gradle outputs + JS bundle analysis"
NFR_BLOCKED_BY="no APK — P0-17 produces the first release build"

apk="$(nfr_apk_path)"
nfr_stub "$(nfr_evidence \
  apk_search "apps/mobile/**/*.apk" \
  apk_found "${apk:-none}")"
