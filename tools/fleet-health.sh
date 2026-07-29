#!/usr/bin/env bash
# fleet-health.sh — one-shot fleet status with STALL and ORPHAN detection.
#
# Why this exists: the architect detects problems by waiting for task-completion
# notifications. A hung agent never sends one, so the fleet can be dead for
# 30+ minutes while looking busy. On 2026-07-26 an orphaned zsh wrapper (parent
# agent killed, `sleep && kill` child never reaped) sat for 38 minutes and read
# as live work. Counting `codewhale exec` processes misses these entirely.
#
# Usage: bash tools/fleet-health.sh [stall_minutes]   (default 10)
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1
STALL_MIN="${1:-10}"
NOW=$(date +%s)
RC=0

echo "=== fleet health $(date '+%H:%M:%S') ==="

# ── Live agents, with log freshness ──
AGENTS=0
for p in $(pgrep -f "codewhale exec" 2>/dev/null); do
  cwd=$(lsof -p "$p" 2>/dev/null | awk '/cwd/{print $NF}' | head -1)
  [ -z "$cwd" ] && continue
  name=$(basename "$cwd")
  AGENTS=$((AGENTS+1))
  log="/Users/$USER/work/agent-logs/${name#openchat-}.log"
  if [ -f "$log" ]; then
    age=$(( (NOW - $(stat -f %m "$log")) / 60 ))
    if [ "$age" -ge "$STALL_MIN" ]; then
      echo "  STALLED  $name — log silent ${age}m (elapsed $(ps -o etime= -p "$p" | tr -d ' '))"
      RC=1
    else
      echo "  ok       $name — log ${age}m ago"
    fi
  else
    echo "  ?        $name — no log found at $log"
  fi
done
[ "$AGENTS" -eq 0 ] && echo "  (no codewhale agents running)"

# ── Collisions: two agents in ONE worktree ──
# On 2026-07-26 a capture agent was dispatched into a worktree that already had a
# migration agent. They fought over the working tree and the same emulator; the
# second broke a test belonging to the first, and the first stalled 40 minutes
# with a zero-byte log. Never run two agents in one worktree.
# NOTE: one `codewhale exec` spawns ~3 processes, so counting raw PIDs per
# directory always fires. Count distinct process GROUPS instead — one agent = one PGID.
COLL=0
for cwd in $(for p in $(pgrep -f "codewhale exec" 2>/dev/null); do
      lsof -p "$p" 2>/dev/null | awk '/cwd/{print $NF}' | head -1
    done | sort -u); do
  ngroups=$(for p in $(pgrep -f "codewhale exec" 2>/dev/null); do
      c=$(lsof -p "$p" 2>/dev/null | awk '/cwd/{print $NF}' | head -1)
      [ "$c" = "$cwd" ] && ps -o pgid= -p "$p" 2>/dev/null | tr -d ' '
    done | sort -u | wc -l | tr -d ' ')
  if [ "${ngroups:-0}" -gt 1 ]; then
    echo "  COLLISION $(basename "$cwd") — $ngroups agents in one worktree"
    COLL=$((COLL+1)); RC=1
  fi
done
[ "$COLL" -eq 0 ] && echo "  (no worktree collisions)"

# ── Orphans: wrappers/watchdogs whose agent is gone ──
ORPH=0
for p in $(pgrep -f "sleep [0-9]+ && kill|screen-readiness|e2e-run-only|gradlew" 2>/dev/null); do
  ppid=$(ps -o ppid= -p "$p" 2>/dev/null | tr -d ' ')
  # orphan == reparented to launchd (ppid 1)
  if [ "$ppid" = "1" ]; then
    echo "  ORPHAN   pid=$p elapsed=$(ps -o etime= -p "$p" | tr -d ' ') — $(ps -o command= -p "$p" | cut -c1-60)"
    ORPH=$((ORPH+1)); RC=1
  fi
done
[ "$ORPH" -eq 0 ] && echo "  (no orphaned wrappers)"

# ── Devices ──
export PATH="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools:$PATH"
N=$(adb devices 2>/dev/null | grep -c "device$")
echo "  devices online: $N/4"
[ "$N" -lt 4 ] && RC=1

# ── Uncommitted work at risk in every worktree ──
for wt in /Users/$USER/work/openchat-*; do
  [ -d "$wt/.git" ] || [ -f "$wt/.git" ] || continue
  n=$(git -C "$wt" status --porcelain 2>/dev/null | wc -l | tr -d ' ')
  [ "$n" -gt 0 ] && echo "  uncommitted: $(basename "$wt") — $n files"
done

echo "=== rc=$RC (1 = something needs attention) ==="
exit $RC
