#!/usr/bin/env bash
# night-watch.sh — unattended safeguard sweep.
#
# Encodes the failure modes actually observed on 2026-07-26/27 so recovery does
# not depend on a human noticing. Run it between adjudications.
#
#   bash tools/night-watch.sh            report only
#   bash tools/night-watch.sh --salvage  also commit orphaned agent work
#
# Each check maps to a real incident:
#   W1 stalled agent   zero-byte log + no file writes, processes alive (40 min lost)
#   W2 orphan procs    children outliving a killed agent, still driving a device (44 min)
#   W3 lost work       step-capped agents leave uncommitted work (7+ occurrences)
#   W4 collisions      two agents in one worktree (broke each other's tests)
#   W5 host pressure   emulators ~2.6-5.3GB each; OOM killed 8 agents + whole fleet
#   W6 red integration a merge left the base branch failing
#   W7 scheduler done  ChatGPT drops a completion doc at /Users/$USER/work root
set -uo pipefail
ROOT="/Users/$USER/work"
INTEG="$ROOT/oc-integration"
SALVAGE=0
[ "${1:-}" = "--salvage" ] && SALVAGE=1
RC=0

echo "=== night-watch $(date '+%m-%d %H:%M:%S') ==="

# ── W7: scheduler completion doc (highest signal — unblocks physical device) ──
FOUND=$(find "$ROOT" -maxdepth 1 -type f \( -iname "*complete*" -o -iname "*scheduler*done*" -o -iname "*READY*" \) -newermt '-24 hours' 2>/dev/null)
if [ -n "$FOUND" ]; then
  echo "  *** SCHEDULER COMPLETION DOC PRESENT ***"
  echo "$FOUND" | sed 's/^/      /'
  echo "      -> physical device 95RY1AFN7 can be claimed; onboard agents to devsched"
else
  echo "  scheduler: no completion doc yet (physical device stays reserved)"
fi

# ── W5: host pressure ──
FREE=$(vm_stat | awk '/Pages free/{printf "%.1f", $3*16384/1073741824}')
LOAD=$(sysctl -n vm.loadavg | tr -d '{}' | awk '{print $1}')
EMUS=$(pgrep -f "qemu-system-aarch64" 2>/dev/null | wc -l | tr -d ' ')
echo "  host: ${FREE}GB free, load ${LOAD}, ${EMUS} emulator(s)"
awk -v f="$FREE" 'BEGIN{ if (f+0 < 2.0) exit 0; exit 1 }' && {
  echo "    WARN low memory — do NOT dispatch more agents or boot emulators"; RC=1; }

# ── W4: two agents in one worktree ──
COLL=0
for cwd in $(for p in $(pgrep -f "codewhale exec" 2>/dev/null); do
      lsof -p "$p" 2>/dev/null | awk '/cwd/{print $NF}' | head -1; done | sort -u); do
  n=$(for p in $(pgrep -f "codewhale exec" 2>/dev/null); do
        c=$(lsof -p "$p" 2>/dev/null | awk '/cwd/{print $NF}' | head -1)
        [ "$c" = "$cwd" ] && ps -o pgid= -p "$p" 2>/dev/null | tr -d ' '
      done | sort -u | wc -l | tr -d ' ')
  [ "${n:-0}" -gt 1 ] && { echo "  COLLISION $(basename "$cwd") — $n agents"; COLL=1; RC=1; }
done
[ "$COLL" -eq 0 ] && echo "  collisions: none"

# ── W2: orphaned device processes ──
ORPH=0
for p in $(pgrep -f "screen-readiness|maestro|e2e-run|e2e-shard" 2>/dev/null); do
  ppid=$(ps -o ppid= -p "$p" 2>/dev/null | tr -d ' ')
  if [ "$ppid" = "1" ]; then
    echo "  ORPHAN pid=$p $(ps -o etime= -p "$p" | tr -d ' ') — $(ps -o command= -p "$p" | cut -c1-50)"
    ORPH=1; RC=1
  fi
done
[ "$ORPH" -eq 0 ] && echo "  orphans: none"

# ── W1/W3: stalled agents and unsalvaged work ──
for wt in "$ROOT"/openchat-*; do
  [ -d "$wt/.git" ] || [ -f "$wt/.git" ] || continue
  n=$(git -C "$wt" status --porcelain 2>/dev/null | grep -vE "node_modules|__pycache__|\.fanout|\.codewhale" | wc -l | tr -d ' ')
  [ "${n:-0}" -eq 0 ] && continue
  live=0
  for p in $(pgrep -f "codewhale exec" 2>/dev/null); do
    c=$(lsof -p "$p" 2>/dev/null | awk '/cwd/{print $NF}' | head -1)
    [ "$c" = "$wt" ] && live=1
  done
  if [ "$live" -eq 0 ]; then
    echo "  UNSALVAGED $(basename "$wt") — $n files, no live agent"
    RC=1
    if [ "$SALVAGE" -eq 1 ]; then
      git -C "$wt" add -A >/dev/null 2>&1
      git -C "$wt" commit -q -m "wip: salvaged from a step-capped or killed agent

Committed by night-watch.sh. NOT VERIFIED — no gate was run against this.
Adjudicate before merging." >/dev/null 2>&1 && echo "      -> salvaged"
    fi
  fi
done

# ── W6: is the base branch green? ──
if [ -d "$INTEG/apps/mobile" ]; then
  ( cd "$INTEG/apps/mobile" && npm test -- --silent >/tmp/nw-test.txt 2>&1 )
  line=$(grep -E "^Tests:" /tmp/nw-test.txt | tail -1)
  fails=$(grep -cE "^FAIL" /tmp/nw-test.txt)
  echo "  integration mobile: ${line:-unknown} (${fails} failing suites)"
  [ "${fails:-0}" -gt 0 ] && RC=1
fi

echo "=== rc=$RC (1 = needs attention) ==="
exit $RC
