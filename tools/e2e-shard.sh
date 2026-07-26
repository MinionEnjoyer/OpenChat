#!/usr/bin/env bash
# e2e-shard.sh <shard-index> <shard-count> <device-serial>
#
# Runs a deterministic SLICE of the Maestro flow suite on ONE device, so N devices
# can run N shards concurrently. Maestro drives a single device at a time, so the
# only way to parallelise UI tests is to shard the suite across devices.
#
# Deterministic slicing (sorted list, stride by shard count) means a given flow
# always lands on the same shard — a failure is reproducible on the same device
# rather than wandering between runs.
set -uo pipefail
IDX="${1:?usage: e2e-shard.sh <idx> <count> <serial>}"
CNT="${2:?}"; DEV="${3:?}"
cd "$(dirname "${BASH_SOURCE[0]}")/.."
source tools/env.sh 2>/dev/null || true
export JAVA_HOME ANDROID_HOME
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
PER_FLOW_TIMEOUT="${PER_FLOW_TIMEOUT:-90}"

# ── Collision detection: two concurrent runs on the same device corrupt
# each other's results (pm clear races, maestro clashes). mkdir is atomic
# on local filesystems — the first writer wins.
LOCKDIR="/tmp/e2e-lock-$DEV"
if ! mkdir "$LOCKDIR" 2>/dev/null; then
  echo "ABORT: another e2e run is already active on $DEV (lockdir $LOCKDIR exists)"
  exit 2
fi
trap 'rmdir "$LOCKDIR" 2>/dev/null' EXIT
APK="apps/mobile/android/app/build/outputs/apk/release/app-release.apk"
BUNDLE="apps/mobile/android/app/build/generated/assets/react/release/index.android.bundle"
EXPECTED_API_HOST="${EXPECTED_API_HOST:-}"

# ══════════════════════════════════════════════════════════════════════
# PREFLIGHT 0 — flow directory exists and has yaml files
# ══════════════════════════════════════════════════════════════════════
FLOW_GLOB="apps/mobile/e2e/flows/*.yaml"
if ! compgen -G "$FLOW_GLOB" >/dev/null 2>&1 && ! ls $FLOW_GLOB >/dev/null 2>&1; then
  echo "ABORT: no flow files found in apps/mobile/e2e/flows/"
  exit 2
fi
echo "[preflight] flow directory ok"

# ══════════════════════════════════════════════════════════════════════
# PREFLIGHT 1 — stale APK (APK must be newer than HEAD commit)
# ══════════════════════════════════════════════════════════════════════
COMMIT_TS=$(git log -1 --format=%ct HEAD 2>/dev/null || echo 0)
if [ -f "$APK" ] && [ "$COMMIT_TS" -gt 0 ]; then
  APK_TS=$(stat -f %m "$APK" 2>/dev/null || stat -c %Y "$APK" 2>/dev/null || echo 0)
  if [ "$APK_TS" -le "$COMMIT_TS" ]; then
    echo "ABORT $DEV: APK is stale — APK mtime ($APK_TS) <= HEAD commit time ($COMMIT_TS). Rebuild."
    exit 2
  fi
  echo "[preflight] APK mtime ($APK_TS) > HEAD commit time ($COMMIT_TS)"
fi

# ══════════════════════════════════════════════════════════════════════
# PREFLIGHT 2 — wrong API host baked into the bundle
# ══════════════════════════════════════════════════════════════════════
# The bundle contains BOTH the ANDROID_EMULATOR_HOST constant ("10.0.2.2")
# AND the inlined EXPO_PUBLIC_API_HOST value, so grepping for the bare
# host matches either — the check passes no matter which host the app
# actually uses.  Instead, search for the full composed URL that only the
# resolved config produces (config.ts: apiBaseUrl = `http://${API_HOST}:3030/api`).
if [ -n "$EXPECTED_API_HOST" ]; then
  if [ ! -f "$BUNDLE" ]; then
    echo "ABORT $DEV: bundle not found at $BUNDLE — cannot verify API host"
    exit 2
  fi
  EXPECTED_URL="http://${EXPECTED_API_HOST}:3030/api"
  if ! strings "$BUNDLE" | grep -qF "$EXPECTED_URL"; then
    echo "ABORT $DEV: bundle does not contain expected API URL '$EXPECTED_URL'"
    echo "  hint: EXPO_PUBLIC_API_HOST was not inlined as '$EXPECTED_API_HOST' at build time"
    exit 2
  fi
  echo "[preflight] API URL '$EXPECTED_URL' confirmed in bundle"
fi

# ══════════════════════════════════════════════════════════════════════
# PREFLIGHT 3 — device reachable, installed, not debuggable
# ══════════════════════════════════════════════════════════════════════
if ! adb -s "$DEV" get-state >/dev/null 2>&1; then
  echo "ABORT $DEV: device not reachable by adb"; exit 2
fi
if ! adb -s "$DEV" shell pm list packages 2>/dev/null | grep -q com.openchat.mobile; then
  echo "ABORT $DEV: com.openchat.mobile not installed"; exit 2
fi
if adb -s "$DEV" shell dumpsys package com.openchat.mobile 2>/dev/null | grep -q DEBUGGABLE; then
  echo "ABORT $DEV: DEBUG build installed (expects Metro) — reinstall the release APK"; exit 2
fi
echo "[preflight] $DEV ok — release build installed"

# ══════════════════════════════════════════════════════════════════════
# MAIN LOOP
# ══════════════════════════════════════════════════════════════════════
mapfile -t ALL < <(ls apps/mobile/e2e/flows/*.yaml | sort)
FLOW_COUNT=0
VERDICT_COUNT=0
PASS=0; FAIL=0; TIMEOUT=0; FAILED=()
declare -A GOT_VERDICT
for i in "${!ALL[@]}"; do
  [ $(( i % CNT )) -eq "$IDX" ] || continue
  f="${ALL[$i]}"
  FLOW_COUNT=$((FLOW_COUNT + 1))
  base="$(basename "$f" .yaml)"
  echo "[$(date +%H:%M:%S)] RUNNING $base on $DEV"
  # ── Hard clear: pm clear wipes expo-secure-store tokens that Maestro's
  #     clearState may leave behind. Repeat before every flow for isolation.
  adb -s "$DEV" shell pm clear com.openchat.mobile </dev/null
  # pm clear also wipes runtime permission grants. Re-grant every dangerous
  # permission the app declares; tolerate failure for permissions the OS refuses.
  adb -s "$DEV" shell pm grant com.openchat.mobile android.permission.CAMERA </dev/null || true
  adb -s "$DEV" shell pm grant com.openchat.mobile android.permission.RECORD_AUDIO </dev/null || true
  # macOS has no GNU `timeout` and gtimeout needs coreutils, so implement the
  # deadline in bash. A single hung flow blocks the whole shard indefinitely.
  maestro --device "$DEV" test "$f" > "/tmp/e2e-$base-$DEV.log" 2>&1 </dev/null &
  mpid=$!
  waited=0
  while kill -0 "$mpid" 2>/dev/null && [ "$waited" -lt "$PER_FLOW_TIMEOUT" ]; do
    sleep 2; waited=$((waited+2))
  done
  if kill -0 "$mpid" 2>/dev/null; then
    kill -9 "$mpid" 2>/dev/null; wait "$mpid" 2>/dev/null
    TIMEOUT=$((TIMEOUT+1)); FAILED+=("$base")
    VERDICT_COUNT=$((VERDICT_COUNT + 1))
    GOT_VERDICT["$base"]=1
    echo "TIMEOUT $base :: exceeded ${PER_FLOW_TIMEOUT}s"
    continue
  fi
  wait "$mpid"
  VERDICT_COUNT=$((VERDICT_COUNT + 1))
  GOT_VERDICT["$base"]=1
  if [ $? -eq 0 ]; then
    PASS=$((PASS+1)); echo "PASS $base"
  else
    FAIL=$((FAIL+1)); FAILED+=("$base"); echo "FAIL $base"
    # Maestro's debug output contains only maestro.log — NO view hierarchy. Without
    # the hierarchy a failure is unactionable: you cannot tell a misspelled testID
    # from a genuinely absent element from a real product bug. Capture it here.
    adb -s "$DEV" shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
    adb -s "$DEV" pull /sdcard/ui.xml "/tmp/e2e-$base-$DEV-hierarchy.xml" >/dev/null 2>&1
    adb -s "$DEV" shell screencap -p /sdcard/s.png >/dev/null 2>&1
    adb -s "$DEV" pull /sdcard/s.png "/tmp/e2e-$base-$DEV-screen.png" >/dev/null 2>&1
    # The single most useful artifact: which testIDs ACTUALLY exist on screen right
    # now. A failing assertion plus this list usually makes the fix obvious.
    grep -oE 'resource-id="[^"]*"' "/tmp/e2e-$base-$DEV-hierarchy.xml" 2>/dev/null \
      | sed 's/resource-id="//;s/"$//' | grep -v '^$' | sort -u \
      > "/tmp/e2e-$base-$DEV-available-ids.txt"
    echo "     hierarchy: /tmp/e2e-$base-$DEV-hierarchy.xml"
    echo "     screenshot: /tmp/e2e-$base-$DEV-screen.png"
    echo "     ids on screen: /tmp/e2e-$base-$DEV-available-ids.txt"
  fi
done

echo "--- shard $IDX/$CNT on $DEV: $PASS passed, $FAIL failed, $TIMEOUT timed out ---"

# ══════════════════════════════════════════════════════════════════════
# VERDICT-COUNT ASSERTION — every dispatched flow must produce a verdict
# ══════════════════════════════════════════════════════════════════════
if [ "$VERDICT_COUNT" -ne "$FLOW_COUNT" ]; then
  echo "FATAL: verdict_count=$VERDICT_COUNT != flow_count=$FLOW_COUNT"
  for i in "${!ALL[@]}"; do
    [ $(( i % CNT )) -eq "$IDX" ] || continue
    b="$(basename "${ALL[$i]}" .yaml)"
    [ -n "${GOT_VERDICT[$b]:-}" ] || echo "  MISSING VERDICT: $b"
  done
  exit 2
fi

[ "$FAIL" -eq 0 ] && [ "$TIMEOUT" -eq 0 ] || { printf 'failed: %s\n' "${FAILED[@]}"; exit 1; }
