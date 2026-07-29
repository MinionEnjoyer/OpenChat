#!/usr/bin/env bash
# NFR-12: crash-free harness sessions ≥99.5% across the full E2E suite ×3
# Armed at Phase 8: the release gate needs the complete suite to run three times.
source "$(dirname "$0")/lib.sh"

NFR_ID="NFR-12"
NFR_NAME="crash-free harness sessions"
NFR_BUDGET="≥99.5% crash-free across the full E2E suite ×3 consecutive runs"
NFR_ARM_AT_PHASE=8
NFR_TOOL="E2E suite ×3 + adb logcat FATAL scanner"
NFR_BLOCKED_BY="no product E2E suite — the release gate runs at Phase 8"

nfr_stub "$(nfr_evidence \
  e2e_flows_present "$(nfr_e2e_flow_count)" \
  last_e2e_run "$([ -f "$NFR_ROOT/artifacts/e2e/last-run.json" ] && echo artifacts/e2e/last-run.json || echo none)" \
  note "existing flows are rig validation (@infra), not product flows")"
