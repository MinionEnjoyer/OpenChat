#!/usr/bin/env bash
# NFR-05: offline read — last 50 msgs of last 10 viewed channels in airplane mode
# Armed at Phase 2: the bounded message cache lands with messaging core.
source "$(dirname "$0")/lib.sh"

NFR_ID="NFR-05"
NFR_NAME="offline read of bounded message cache"
NFR_BUDGET="last 50 msgs of last 10 viewed channels render with airplane mode"
NFR_ARM_AT_PHASE=2
NFR_TOOL="Maestro flow with airplane mode toggled via adb"
NFR_BLOCKED_BY="no persisted message cache — Phase 2 (06 §6 defines the bounded cache)"

nfr_stub "$(nfr_evidence \
  e2e_flows_present "$(nfr_e2e_flow_count)" \
  mobile_cache_module "absent")"
