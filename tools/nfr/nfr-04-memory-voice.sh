#!/usr/bin/env bash
# NFR-04: steady-state memory in a voice call ≤400MB PSS
# Armed at Phase 6: voice calls are the subject under measurement.
source "$(dirname "$0")/lib.sh"

NFR_ID="NFR-04"
NFR_NAME="steady-state memory in voice call"
NFR_BUDGET="≤400MB PSS"
NFR_ARM_AT_PHASE=6
NFR_TOOL="dumpsys meminfo <pkg> sampled in-call"
NFR_BLOCKED_BY="no voice call path on mobile — Phase 6"

nfr_stub "$(nfr_evidence \
  livekit_dev_service "docker-compose.dev.yml: livekit" \
  mobile_voice_feature "absent")"
