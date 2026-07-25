#!/usr/bin/env bash
# NFR-10: backend backward compatibility — web client smoke E2E green on every
# backend change. Armed at Phase 1: P1-01 is the first backend change, and this
# is the gate that proves it did not break the web reference implementation.
source "$(dirname "$0")/lib.sh"

NFR_ID="NFR-10"
NFR_NAME="web client backward compatibility"
NFR_BUDGET="web smoke E2E green on every backend change"
NFR_ARM_AT_PHASE=1
NFR_TOOL="CI web-smoke job triggered on apps/api or contracts/ changes"
NFR_BLOCKED_BY="CI has never executed — the web-smoke job is wired in ci.yml but unproven (docs/release/HITL-0.md)"

ci_workflow="$(ls "$NFR_ROOT/.github/workflows"/*.yml 2>/dev/null | head -n1)"
nfr_stub "$(nfr_evidence \
  ci_workflow "${ci_workflow:-absent}" \
  proven_run_record "none — see docs/release/HITL-0.md" \
  backend_changes_so_far "0 (git diff apps/api/src against upstream base is empty)")"
