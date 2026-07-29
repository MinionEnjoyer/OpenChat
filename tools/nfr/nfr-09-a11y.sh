#!/usr/bin/env bash
# NFR-09: accessibility — tappables labelled, 1.3× font scale without clipping
# Armed at Phase 2: core flows to re-run at 1.3× exist once messaging ships.
source "$(dirname "$0")/lib.sh"

NFR_ID="NFR-09"
NFR_NAME="accessibility labels and font scaling"
NFR_BUDGET="all tappables labelled; text scales to 1.3× without clipping critical UI"
NFR_ARM_AT_PHASE=2
NFR_TOOL="eslint a11y rule + Maestro re-run of core flows at --font-scale 1.3"
NFR_BLOCKED_BY="no product UI and no core flows to re-run — P0-17 then Phase 1/2"

nfr_stub "$(nfr_evidence \
  mobile_src_files "$(nfr_mobile_src_files)" \
  e2e_flows_present "$(nfr_e2e_flow_count)" \
  note "existing flows are rig validation (@infra), not product flows")"
