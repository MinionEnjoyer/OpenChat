#!/usr/bin/env bash
# e2e-run-only.sh <device> <flowlist-file> — run flows, record verdicts, FIX NOTHING.
#
# Separating execution from repair is deliberate. A single agent asked to run AND fix
# 8 flows spends its entire step budget on read-diagnose-edit-rerun loops and finishes
# nothing — observed: 30 minutes, zero flows completed, zero reports.
# Running is fast and mechanical; repair is judgement. Do them in separate passes.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1
source tools/env.sh 2>/dev/null || true
export JAVA_HOME ANDROID_HOME
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
DEV="${1:?device}"; LIST="${2:?flow list file}"
PER_FLOW_TIMEOUT="${PER_FLOW_TIMEOUT:-90}"
OUT="/tmp/e2e-verdicts-$DEV.txt"; : > "$OUT"

# ── PREFLIGHT: refuse to run against a device that cannot produce valid results ──
# An agent once installed a DEBUG build over the release APK mid-session. A debug build
# expects a Metro dev server, so the app showed "Unable to load script" and EVERY flow
# failed — 7 invalid failures that looked exactly like product bugs. The run reported
# results with total confidence. Verify the device is fit before trusting anything.
if ! adb -s "$DEV" get-state >/dev/null 2>&1; then
  echo "ABORT $DEV: device not reachable by adb" | tee -a "$OUT"; exit 2
fi
if ! adb -s "$DEV" shell pm list packages 2>/dev/null | grep -q com.openchat.mobile; then
  echo "ABORT $DEV: com.openchat.mobile not installed" | tee -a "$OUT"; exit 2
fi
if adb -s "$DEV" shell dumpsys package com.openchat.mobile 2>/dev/null | grep -q DEBUGGABLE; then
  echo "ABORT $DEV: DEBUG build installed (expects Metro) — reinstall the release APK" | tee -a "$OUT"; exit 2
fi
echo "[preflight] $DEV ok — release build installed" | tee -a "$OUT"
while read -r f <&3; do
  [ -z "$f" ] && continue
  base=$(basename "$f" .yaml)
  echo "[$(date +%H:%M:%S)] RUNNING $base on $DEV" | tee -a "$OUT"
  # ── Hard clear: pm clear wipes expo-secure-store tokens that Maestro's
  #     clearState may leave behind. Repeat before every flow for isolation.
  adb -s "$DEV" shell pm clear com.openchat.mobile </dev/null
  # macOS has no GNU `timeout` and gtimeout needs coreutils, so implement the deadline
  # in bash. This is not optional: a single hung flow blocks the whole run, and with four
  # devices running concurrently one hang stalls every downstream wait indefinitely.
  maestro --device "$DEV" test "$f" >"/tmp/e2e-$base-$DEV.log" 2>&1 </dev/null &
  mpid=$!
  waited=0
  while kill -0 "$mpid" 2>/dev/null && [ "$waited" -lt "$PER_FLOW_TIMEOUT" ]; do
    sleep 2; waited=$((waited+2))
  done
  if kill -0 "$mpid" 2>/dev/null; then
    kill -9 "$mpid" 2>/dev/null; wait "$mpid" 2>/dev/null
    echo "TIMEOUT $base :: exceeded ${PER_FLOW_TIMEOUT}s" | tee -a "$OUT"
    continue
  fi
  wait "$mpid"
  if [ $? -eq 0 ]; then
    echo "PASS $base" | tee -a "$OUT"
  else
    # capture what was actually on screen — makes the later repair pass trivial
    adb -s "$DEV" shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 </dev/null
    adb -s "$DEV" pull /sdcard/ui.xml "/tmp/e2e-$base-$DEV-ui.xml" >/dev/null 2>&1 </dev/null
    grep -oE 'resource-id="[^"]*"' "/tmp/e2e-$base-$DEV-ui.xml" 2>/dev/null \
      | sed 's/resource-id="//;s/"$//' | sort -u > "/tmp/e2e-$base-$DEV-ids.txt"
    reason=$(grep -oE "Assertion is false[^\"]{0,60}|Element not found[^\"]{0,60}" "/tmp/e2e-$base-$DEV.log" | head -1)
    echo "FAIL $base :: ${reason:-see log}" | tee -a "$OUT"
  fi
done 3< "$LIST"
echo "--- $DEV done: $(grep -c ^PASS "$OUT") passed, $(grep -c ^FAIL "$OUT") failed ---" | tee -a "$OUT"
