#!/usr/bin/env bash
# NFR-02: message list scroll <5% janky frames on a 1000-msg channel
# Armed at Phase 2: the message list is the subject under measurement.
source "$(dirname "$0")/lib.sh"

NFR_ID="NFR-02"
NFR_NAME="scroll jank on 1000-msg channel"
NFR_BUDGET="<5% janky frames"
NFR_ARM_AT_PHASE=2
NFR_TOOL="dumpsys gfxinfo <pkg> framestats during a Maestro scroll flow"
NFR_BLOCKED_BY="no message list — Phase 2 (the #volume 1000-msg channel already seeds via P0-06)"

apk="$(nfr_apk_path)"
nfr_stub "$(nfr_evidence \
  apk_found "${apk:-none}" \
  seeded_volume_channel "tools/seed/seed.mjs #volume (1000 msgs)")"
