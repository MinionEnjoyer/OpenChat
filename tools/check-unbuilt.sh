#!/usr/bin/env bash
# check-unbuilt.sh — gate: no open UNBUILT entry may block a signed-off phase.
#
# Parses UNBUILT-* entries from docs/BACKLOG.md, cross-references each entry's
# FR against specs/01-REQUIREMENTS.md to determine its phase, and exits non-zero
# if any OPEN (unresolved) entry targets an FR whose phase is already signed off
# or is the phase currently being signed off (--phase N).
#
# Resolved marker:
#   An UNBUILT entry is considered RESOLVED if it contains a line matching
#   the case-insensitive pattern: **Status:** RESOLVED
#   within the entry's section (from its ## UNBUILT- header to the next
#   ## heading, --- separator, or EOF). Absence of this line means OPEN.
#
# Signed-off phases:
#   Any file matching docs/signoffs/T4-phase*-signoff.md is parsed for its
#   phase number. The phase digit is extracted from the filename.
#
# Usage:
#   tools/check-unbuilt.sh [--phase N]
#
#   --phase N   Also gate phase N (the one being signed off now), cumulative
#               with any already-signed-off phases. Without this flag, only
#               phases with existing signoff files are gated.
# Exit: 0 if no open UNBUILT blocks a gated phase; 1 otherwise.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

BACKLOG="$ROOT/docs/BACKLOG.md"
REQUIREMENTS="$ROOT/specs/01-REQUIREMENTS.md"
SIGNOFFS_DIR="$ROOT/docs/signoffs"

# ── Parse CLI ──────────────────────────────────────────────────────────────
PHASE_ARG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --phase)
      PHASE_ARG="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: tools/check-unbuilt.sh [--phase N]" >&2
      exit 2
      ;;
  esac
done

# ── Determine gated phases ─────────────────────────────────────────────────
GATED_PHASES=""
if [[ -d "$SIGNOFFS_DIR" ]]; then
  for f in "$SIGNOFFS_DIR"/T4-phase*-signoff.md; do
    [[ -f "$f" ]] || continue
    fname="$(basename "$f")"
    if [[ "$fname" =~ T4-phase([0-9]+)-signoff\.md ]]; then
      GATED_PHASES="$GATED_PHASES ${BASH_REMATCH[1]}"
    fi
  done
fi
if [[ -n "$PHASE_ARG" ]]; then
  GATED_PHASES="$GATED_PHASES $PHASE_ARG"
fi
GATED_PHASES="${GATED_PHASES# }"  # trim leading space

if [[ -z "$GATED_PHASES" ]]; then
  echo "OK: no phases signed off and no --phase given; nothing to gate."
  exit 0
fi

# ── Helper: look up an FR's phase from specs/01-REQUIREMENTS.md ────────────
fr_phase_of() {
  local fr="$1"
  local phase="unknown"
  while IFS= read -r line; do
    # Match: | FR-XXX-NNN | ... (prefix match, then extract phase from end)
    if [[ "$line" =~ ^\|\ *"$fr"\  ]]; then
      # Extract last numeric value after the priority column: | P0 | 1 |
      if [[ "$line" =~ \|\ *P[0-9]+\ *\|\ *([0-9]+) ]]; then
        phase="${BASH_REMATCH[1]}"
      fi
      break
    fi
  done < "$REQUIREMENTS"
  echo "$phase"
}

# ── Helper: is a phase number ≤ any gated phase? ──────────────────────────
is_gated() {
  local phase="$1"
  for gp in $GATED_PHASES; do
    if [[ "$phase" -le "$gp" ]]; then
      return 0
    fi
  done
  return 1
}

# ── Main: extract UNBUILT entries and gate ─────────────────────────────────
# Strategy: use awk to split BACKLOG.md into UNBUILT entry blocks, then
# process each block. This avoids bash 3.x function-ordering issues and
# subshell variable-loss problems.

ENTRY_COUNT=0
OPEN_COUNT=0
HAD_ERROR=false
STDERR_OUT=""

# Extract UNBUILT blocks: from each "## UNBUILT-NNN:" line to the next
# "## " heading or "---" separator. Output as NUL-delimited blocks.
# We use awk to extract blocks and pass them one at a time via a temp approach.
# Simpler: use a file-descriptor trick with process substitution.

process_block() {
  local block="$1"
  ENTRY_COUNT=$((ENTRY_COUNT + 1))

  # Extract UNBUILT ID
  local unbuilt_id=""
  if [[ "$block" =~ UNBUILT-([0-9]+) ]]; then
    unbuilt_id="UNBUILT-${BASH_REMATCH[1]}"
  fi

  # Extract FR ID
  local fr_id=""
  if [[ "$block" =~ UNBUILT-[0-9]+:[[:space:]]*(FR-[A-Z]+-[0-9]{3}) ]]; then
    fr_id="${BASH_REMATCH[1]}"
  fi

  # Check resolved
  local resolved=false
  if echo "$block" | grep -qi '\*\*Status:\*\*[[:space:]]*RESOLVED'; then
    resolved=true
  fi

  # Extract priority
  local priority=""
  if [[ "$block" =~ \*\*Priority:\*\*[[:space:]]*([A-Z]+) ]]; then
    priority="${BASH_REMATCH[1]}"
  fi

  if $resolved; then
    echo "  $unbuilt_id ($fr_id, $priority) — RESOLVED"
    return
  fi

  OPEN_COUNT=$((OPEN_COUNT + 1))

  # Look up phase
  local fr_phase
  fr_phase="$(fr_phase_of "$fr_id")"
  if [[ "$fr_phase" == "unknown" ]]; then
    STDERR_OUT="${STDERR_OUT}"$'\n'"ERROR: $unbuilt_id: $fr_id ($priority) — FR not found in $REQUIREMENTS"
    HAD_ERROR=true
    return
  fi

  if is_gated "$fr_phase"; then
    echo "  $unbuilt_id ($fr_id, Phase $fr_phase, $priority) — OPEN → BLOCKS"
    STDERR_OUT="${STDERR_OUT}"$'\n'"ERROR: $unbuilt_id: $fr_id (Phase $fr_phase, $priority) is OPEN but phase $fr_phase ≤ a gated phase"
    HAD_ERROR=true
    return
  fi

  echo "  $unbuilt_id ($fr_id, Phase $fr_phase, $priority) — OPEN (not in any gated phase)"
}

# Use awk to split into UNBUILT blocks.
# We collect blocks by reading the file and calling process_block for each.
IN=false
BLOCK=""
while IFS= read -r line || [[ -n "$line" ]]; do
  if [[ "$line" =~ ^##[[:space:]]+UNBUILT-[0-9]+: ]]; then
    if $IN && [[ -n "$BLOCK" ]]; then
      process_block "$BLOCK"
    fi
    IN=true
    BLOCK="$line"
  elif $IN; then
    if [[ "$line" =~ ^##[[:space:]] ]] || [[ "$line" == "---" ]]; then
      process_block "$BLOCK"
      IN=false
      BLOCK=""
    else
      BLOCK="$BLOCK"$'\n'"$line"
    fi
  fi
done < "$BACKLOG"
if $IN && [[ -n "$BLOCK" ]]; then
  process_block "$BLOCK"
fi

# ── Report ─────────────────────────────────────────────────────────────────
echo "Gated phases: ${GATED_PHASES}"
echo "UNBUILT entries: $ENTRY_COUNT total, $OPEN_COUNT open"

if $HAD_ERROR; then
  echo "$STDERR_OUT" | tail -n +2 >&2
  echo "" >&2
  echo "FAIL: open UNBUILT entries block a gated phase." >&2
  exit 1
fi

echo "OK: no open UNBUILT entries block any gated phase."
exit 0
