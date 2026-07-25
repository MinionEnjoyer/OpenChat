#!/usr/bin/env bash
# NFR-11: i18n readiness — user-facing strings go through a strings module
# Armed at Phase 1: the first product screens are the first thing to lint.
source "$(dirname "$0")/lib.sh"

NFR_ID="NFR-11"
NFR_NAME="i18n readiness (no literal JSX strings)"
NFR_BUDGET="no literal JSX strings; all user-facing text via the strings module"
NFR_ARM_AT_PHASE=1
NFR_TOOL="eslint rule over apps/mobile/src"
NFR_BLOCKED_BY="no JSX in apps/mobile/src — only generated .d.ts and a contract consumer test"

nfr_stub "$(nfr_evidence \
  mobile_src_files "$(nfr_mobile_src_files)" \
  mobile_tsx_files "$(find "$NFR_ROOT/apps/mobile/src" -name '*.tsx' -type f 2>/dev/null | wc -l | tr -d ' ')" \
  eslint_config "$([ -f "$NFR_ROOT/apps/mobile/.eslintrc.js" ] && echo present || echo absent)")"
