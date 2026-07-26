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
APK="apps/mobile/android/app/build/outputs/apk/release/app-release.apk"
BUNDLE="apps/mobile/android/app/build/generated/assets/react/release/index.android.bundle"
EXPECTED_API_HOST="${EXPECTED_API_HOST:-}"

# ══════════════════════════════════════════════════════════════════════
# PREFLIGHT 0 — nonexistent flow paths
# ══════════════════════════════════════════════════════════════════════
MISSING=()
while IFS= read -r f; do
  [ -z "$f" ] && continue
  [ -f "$f" ] || MISSING+=("$f")
done < "$LIST"
if [ ${#MISSING[@]} -gt 0 ]; then
  echo "ABORT: nonexistent flow paths in $LIST:"
  printf '  %s\n' "${MISSING[@]}"
  exit 2
fi
echo "[preflight] all flow paths exist" | tee -a "$OUT"

# ══════════════════════════════════════════════════════════════════════
# PREFLIGHT 1 — stale APK (APK must be newer than HEAD commit)
# ══════════════════════════════════════════════════════════════════════
COMMIT_TS=$(git log -1 --format=%ct HEAD 2>/dev/null || echo 0)
if [ -f "$APK" ] && [ "$COMMIT_TS" -gt 0 ]; then
  APK_TS=$(stat -f %m "$APK" 2>/dev/null || stat -c %Y "$APK" 2>/dev/null || echo 0)
  if [ "$APK_TS" -le "$COMMIT_TS" ]; then
    echo "ABORT $DEV: APK is stale — APK mtime ($APK_TS) <= HEAD commit time ($COMMIT_TS). Rebuild." | tee -a "$OUT"
    exit 2
  fi
  echo "[preflight] APK mtime ($APK_TS) > HEAD commit time ($COMMIT_TS)" | tee -a "$OUT"
fi

# ══════════════════════════════════════════════════════════════════════
# PREFLIGHT 2 — wrong API host baked into the bundle
# ══════════════════════════════════════════════════════════════════════
if [ -n "$EXPECTED_API_HOST" ]; then
  if [ ! -f "$BUNDLE" ]; then
    echo "ABORT $DEV: bundle not found at $BUNDLE — cannot verify API host" | tee -a "$OUT"
    exit 2
  fi
  if ! strings "$BUNDLE" | grep -q "$EXPECTED_API_HOST"; then
    echo "ABORT $DEV: bundle does not contain expected API host '$EXPECTED_API_HOST'" | tee -a "$OUT"
    exit 2
  fi
  echo "[preflight] API host '$EXPECTED_API_HOST' confirmed in bundle" | tee -a "$OUT"
fi

# ══════════════════════════════════════════════════════════════════════
# PREFLIGHT 3 — device reachable, installed, not debuggable
# ══════════════════════════════════════════════════════════════════════
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

# ══════════════════════════════════════════════════════════════════════
# MAIN LOOP
# ══════════════════════════════════════════════════════════════════════
FLOW_COUNT=0
VERDICT_COUNT=0
while read -r f <&3; do
  [ -z "$f" ] && continue
  FLOW_COUNT=$((FLOW_COUNT + 1))
  base=$(basename "$f" .yaml)
  echo "[$(date +%H:%M:%S)] RUNNING $base on $DEV" | tee -a "$OUT"
  # ── Hard clear: pm clear wipes expo-secure-store tokens that Maestro's
  #     clearState may leave behind. Repeat before every flow for isolation.
  adb -s "$DEV" shell pm clear com.openchat.mobile </dev/null
  # pm clear also wipes runtime permission grants. Re-grant every dangerous
  # permission the app declares; tolerate failure for permissions the OS refuses.
  adb -s "$DEV" shell pm grant com.openchat.mobile android.permission.CAMERA </dev/null || true
  adb -s "$DEV" shell pm grant com.openchat.mobile android.permission.RECORD_AUDIO </dev/null || true
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
    VERDICT_COUNT=$((VERDICT_COUNT + 1))
    continue
  fi
  wait "$mpid"
  VERDICT_COUNT=$((VERDICT_COUNT + 1))
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

PASS_COUNT=$(grep -c '^PASS ' "$OUT" 2>/dev/null || echo 0)
FAIL_COUNT=$(grep -c '^FAIL ' "$OUT" 2>/dev/null || echo 0)
TIMEOUT_COUNT=$(grep -c '^TIMEOUT ' "$OUT" 2>/dev/null || echo 0)
echo "--- $DEV done: $PASS_COUNT passed, $FAIL_COUNT failed, $TIMEOUT_COUNT timed out ---" | tee -a "$OUT"

# ══════════════════════════════════════════════════════════════════════
# VERDICT-COUNT ASSERTION — every dispatched flow must produce a verdict
# ══════════════════════════════════════════════════════════════════════
if [ "$VERDICT_COUNT" -ne "$FLOW_COUNT" ]; then
  echo "FATAL: verdict_count=$VERDICT_COUNT != flow_count=$FLOW_COUNT" | tee -a "$OUT"
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    b=$(basename "$f" .yaml)
    if ! grep -qE "^(PASS|FAIL|TIMEOUT) $b" "$OUT"; then
      echo "  MISSING VERDICT: $b" | tee -a "$OUT"
    fi
  done < "$LIST"
  exit 2
fi
