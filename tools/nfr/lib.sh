#!/usr/bin/env bash
# NFR harness shared protocol (P0-16).
#
# Problem this solves: an NFR script that prints a hardcoded "not measurable yet"
# reason is a vacuous gate — it cannot fail, and the prose goes stale silently the
# moment the blocker it describes is gone. 04 §11 asks for stubs that
# "fail-as-not-implemented"; this library is that mechanism.
#
# Every script declares ARM_AT_PHASE: the phase *during which* its budget must
# become measurable for real, derived from 01 §4 and the phase spec that
# introduces the subject under measurement. The library compares it against
# .phase (the single source of truth read by devctl and trace.mjs):
#
#   .phase <= ARM_AT_PHASE  → "blocked"  (declared, with machine-observed evidence)
#   .phase >  ARM_AT_PHASE  → "overdue"  (pass=false; the runner exits non-zero)
#
# The gate fires when a phase is left behind with its promise unmet, not the
# instant that phase opens — the work gets a full phase of runway, and the
# failure lands at signoff, which is where an unmet promise should block. Either
# way nobody has to remember to revisit a stub.
#
# Script contract — set these, then call nfr_stub or nfr_emit_armed:
#   NFR_ID             e.g. NFR-02                       (required)
#   NFR_NAME           short human label                 (required)
#   NFR_BUDGET         the oracle from 01 §4             (required)
#   NFR_ARM_AT_PHASE   integer phase                     (required)
#   NFR_TOOL           how it will be measured           (required)
#   NFR_BLOCKED_BY     what is missing today             (required for nfr_stub)
#   NFR_SCOPE_COMPLETE true|false — false means the measurement exists but does
#                      not yet cover the whole requirement, so the ratchet still
#                      applies at ARM_AT_PHASE (default true)

set -euo pipefail

NFR_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NFR_ROOT="$(cd "$NFR_LIB_DIR/../.." && pwd)"

nfr_phase() {
  local phase_file="$NFR_ROOT/.phase"
  if [ -f "$phase_file" ]; then
    head -n1 "$phase_file" | tr -d '[:space:]'
  else
    echo "0"
  fi
}

# ── Machine-observed evidence helpers ────────────────────────────────
# These replace prose claims ("No APK exists yet") with a fact checked at run
# time. A blocked entry carries what was looked for and what was found.

nfr_apk_path() {
  find "$NFR_ROOT/apps/mobile" -name '*.apk' -type f 2>/dev/null | head -n1
}

nfr_mobile_tsconfig() {
  [ -f "$NFR_ROOT/apps/mobile/tsconfig.json" ] && echo "$NFR_ROOT/apps/mobile/tsconfig.json" || true
}

nfr_mobile_src_files() {
  find "$NFR_ROOT/apps/mobile/src" \( -name '*.ts' -o -name '*.tsx' \) -type f 2>/dev/null | wc -l | tr -d ' '
}

nfr_e2e_flow_count() {
  find "$NFR_ROOT/apps/mobile/e2e/flows" -name '*.yaml' -type f 2>/dev/null | wc -l | tr -d ' '
}

# nfr_evidence <key> <value> [<key> <value> …] — build the evidence object.
nfr_evidence() {
  local args=()
  while [ "$#" -gt 0 ]; do
    args+=(--arg "$1" "$2")
    shift 2
  done
  if [ "${#args[@]}" -eq 0 ]; then
    echo '{}'
  else
    jq -n "${args[@]}" '$ARGS.named'
  fi
}

# ── Emission ─────────────────────────────────────────────────────────

_nfr_require() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    echo "nfr lib: $name is not set in $0" >&2
    exit 2
  fi
}

_nfr_base_json() {
  _nfr_require NFR_ID
  _nfr_require NFR_NAME
  _nfr_require NFR_BUDGET
  _nfr_require NFR_ARM_AT_PHASE
  _nfr_require NFR_TOOL
  jq -n \
    --arg id "$NFR_ID" \
    --arg name "$NFR_NAME" \
    --arg budget "$NFR_BUDGET" \
    --arg tool "$NFR_TOOL" \
    --argjson arm_at_phase "$NFR_ARM_AT_PHASE" \
    --argjson observed_phase "$(nfr_phase)" \
    '{id: $id, name: $name, budget: $budget, tool: $tool,
      arm_at_phase: $arm_at_phase, observed_phase: $observed_phase}'
}

# nfr_stub [<evidence-json>] — no measurement implemented yet.
# Emits "blocked" before ARM_AT_PHASE, "overdue" (pass=false) at or after it.
nfr_stub() {
  local evidence="${1:-{\}}"
  _nfr_require NFR_BLOCKED_BY
  local phase overdue
  phase="$(nfr_phase)"
  if [ "$phase" -gt "$NFR_ARM_AT_PHASE" ]; then
    overdue=true
  else
    overdue=false
  fi

  if [ "$overdue" = true ]; then
    _nfr_base_json | jq \
      --arg blocked_by "$NFR_BLOCKED_BY" \
      --argjson evidence "$evidence" \
      '. + {status: "overdue", pass: false, blocked_by: $blocked_by, evidence: $evidence,
            reason: ("phase \(.observed_phase) is past arm_at_phase \(.arm_at_phase) " +
                     "but no measurement is implemented — implement it, or move arm_at_phase " +
                     "with a Decision Record")}'
  else
    _nfr_base_json | jq \
      --arg blocked_by "$NFR_BLOCKED_BY" \
      --argjson evidence "$evidence" \
      '. + {status: "blocked", blocked_by: $blocked_by, evidence: $evidence,
            reason: ("not yet measurable at phase \(.observed_phase); must be armed during " +
                     "phase \(.arm_at_phase)")}'
  fi
}

# nfr_emit_armed <value> <pass:true|false> [<evidence-json>] — a real measurement.
# If NFR_SCOPE_COMPLETE=false and .phase has reached ARM_AT_PHASE, the partial
# measurement is not enough and the entry is reported overdue.
nfr_emit_armed() {
  local value="$1" pass="$2" evidence="${3:-{\}}"
  local phase scope_complete
  phase="$(nfr_phase)"
  scope_complete="${NFR_SCOPE_COMPLETE:-true}"

  if [ "$scope_complete" != true ] && [ "$phase" -gt "$NFR_ARM_AT_PHASE" ]; then
    _nfr_base_json | jq \
      --arg value "$value" \
      --arg scope_pending "${NFR_SCOPE_PENDING:-unspecified}" \
      --argjson evidence "$evidence" \
      '. + {status: "overdue", pass: false, value: $value, scope_pending: $scope_pending,
            evidence: $evidence,
            reason: ("measured, but only over part of the requirement; phase \(.observed_phase) " +
                     "is past arm_at_phase \(.arm_at_phase) so full scope is required")}'
    return
  fi

  _nfr_base_json | jq \
    --arg value "$value" \
    --argjson pass "$pass" \
    --arg scope_pending "${NFR_SCOPE_PENDING:-}" \
    --argjson evidence "$evidence" \
    '. + {status: "armed", value: $value, pass: $pass, evidence: $evidence}
     + (if $scope_pending == "" then {} else {scope_pending: $scope_pending} end)'
}
