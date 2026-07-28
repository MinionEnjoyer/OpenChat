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
source tools/e2e-provision.sh
export JAVA_HOME ANDROID_HOME
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
DEV="${1:?device}"; LIST="${2:?flow list file}"
PER_FLOW_TIMEOUT="${PER_FLOW_TIMEOUT:-90}"

# ── Collision detection: two concurrent runs on the same device corrupt
# each other's results (verdicts interleave, pm clear races, maestro clashes).
# mkdir is atomic on local filesystems — the first writer wins.
RUN_ID="$$-$(date +%s)"
LOCKDIR="/tmp/e2e-lock-$DEV"
if ! mkdir "$LOCKDIR" 2>/dev/null; then
  echo "ABORT: another e2e run is already active on $DEV (lockdir $LOCKDIR exists)"
  exit 2
fi
trap 'rmdir "$LOCKDIR" 2>/dev/null' EXIT
OUT="/tmp/e2e-verdicts-$DEV-$RUN_ID.txt"; : > "$OUT"
APK="apps/mobile/android/app/build/outputs/apk/release/app-release.apk"
BUNDLE="apps/mobile/android/app/build/generated/assets/react/release/index.android.bundle"
# E2E APK build command (must include EXPO_PUBLIC_ENABLE_DEV_LOGIN=true so the
# release APK renders the dev-login UI — see LoginScreen.tsx / P1-04):
#   EXPO_PUBLIC_ENABLE_DEV_LOGIN=true EXPO_PUBLIC_API_HOST=10.0.2.2 npm run apk:release
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
# PREFLIGHT 1 — stale APK
# ══════════════════════════════════════════════════════════════════════
# Compare against the last commit that touches code the APK is BUILT FROM, not
# HEAD. Comparing to HEAD meant committing a runner tweak or a doc marked every
# APK on every device stale, forcing a full rebuild-and-reinstall cycle that
# changed no shipped byte. That fired mid-session and aborted all 7 devices at
# once. Anything outside these paths cannot alter the bundle.
APK_SRC_PATHS=(apps/mobile packages)
COMMIT_TS=$(git log -1 --format=%ct HEAD -- "${APK_SRC_PATHS[@]}" 2>/dev/null || echo 0)
if [ -f "$APK" ] && [ "$COMMIT_TS" -gt 0 ]; then
  APK_TS=$(stat -f %m "$APK" 2>/dev/null || stat -c %Y "$APK" 2>/dev/null || echo 0)
  if [ "$APK_TS" -le "$COMMIT_TS" ]; then
    echo "ABORT $DEV: APK is stale — APK mtime ($APK_TS) <= last app-source commit ($COMMIT_TS). Rebuild." | tee -a "$OUT"
    exit 2
  fi
  echo "[preflight] APK mtime ($APK_TS) > last app-source commit ($COMMIT_TS)" | tee -a "$OUT"
fi
# Uncommitted app-source edits also invalidate the APK — they are not in any
# commit timestamp, so the check above cannot see them.
if ! git diff --quiet -- "${APK_SRC_PATHS[@]}" 2>/dev/null; then
  echo "[preflight] WARNING: uncommitted changes under ${APK_SRC_PATHS[*]} — APK may not contain them" | tee -a "$OUT"
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
    echo "ABORT $DEV: bundle not found at $BUNDLE — cannot verify API host" | tee -a "$OUT"
    exit 2
  fi
  EXPECTED_URL="http://${EXPECTED_API_HOST}:3030/api"
  if ! strings "$BUNDLE" | grep -qF "$EXPECTED_URL"; then
    echo "ABORT $DEV: bundle does not contain expected API URL '$EXPECTED_URL'" | tee -a "$OUT"
    echo "  hint: EXPO_PUBLIC_API_HOST was not inlined as '$EXPECTED_API_HOST' at build time" | tee -a "$OUT"
    exit 2
  fi
  echo "[preflight] API URL '$EXPECTED_URL' confirmed in bundle" | tee -a "$OUT"
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

  # ── Device liveness + tunnel re-arm. BOTH failures observed 2026-07-27:
  #
  #   1. A tablet dropped off USB mid-run. `adb devices` stopped listing it,
  #      every remaining flow "failed", and the verdicts looked like product
  #      defects. They were a detached cable.
  #   2. `adb reverse` does NOT survive a USB reconnect. The app reaches the API
  #      through 127.0.0.1:3030 over that tunnel, so once it dies every flow
  #      fails at login with "shell-screen is visible" — indistinguishable from
  #      a real auth regression. On both phones ONLY the first flow passed.
  #
  # Re-arming per flow is cheap; a whole run misattributed to the product is not.
  if ! adb devices | awk '$2=="device"{print $1}' | grep -qx "$DEV"; then
    echo "ABORT $DEV: device is no longer attached (was it unplugged?)" | tee -a "$OUT"
    exit 3
  fi
  if [ "$(adb -s "$DEV" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r ')" != "1" ]; then
    echo "ABORT $DEV: device present in adb but not booted (sys.boot_completed != 1)" | tee -a "$OUT"
    exit 3
  fi
  adb -s "$DEV" reverse tcp:3030 tcp:3030 >/dev/null 2>&1 \
    || { echo "ABORT $DEV: could not establish reverse tunnel to :3030" | tee -a "$OUT"; exit 3; }

  # ── Voice flows cannot produce a verdict on an emulator. ──
  # Verified by hand on 2026-07-27: voice connects and renders fully on a
  # physical Pixel (room view, controls, pill, disconnect all reached), and
  # TIMES OUT connecting on every emulator — no real mic/camera, so the WebRTC
  # session never establishes.
  #
  # Running them on an emulator therefore yields FAIL for a working feature. A
  # 43-flow sweep reported 7 voice defects; 6 were this, and the 7th (voice-pill
  # persisting after disconnect) was only visible on the physical device. SKIP is
  # deliberately not PASS: these still owe real evidence, on real hardware.
  case "$DEV:$base" in
    emulator-*:p6-*|emulator-*:*voice*|emulator-*:*-call-*)
      echo "SKIP $base :: voice/WebRTC needs a physical device (emulator cannot connect)" | tee -a "$OUT"
      VERDICT_COUNT=$((VERDICT_COUNT + 1))
      continue ;;
  esac

  echo "[$(date +%H:%M:%S)] RUNNING $base on $DEV" | tee -a "$OUT"
  # ── Hard clear: pm clear wipes expo-secure-store tokens that Maestro's
  #     clearState may leave behind. Repeat before every flow for isolation.
  #     Skip for flows annotated with # e2e:no-clear (e.g. session-restore).
  if grep -q 'e2e:no-clear' "$f" 2>/dev/null; then
    echo "[$(date +%H:%M:%S)] no-clear $base" | tee -a "$OUT"
  else
    adb -s "$DEV" shell pm clear com.openchat.mobile </dev/null
  fi
  # pm clear also wipes runtime permission grants. Re-grant every dangerous
  # permission the app declares; tolerate failure for permissions the OS refuses.
  adb -s "$DEV" shell pm grant com.openchat.mobile android.permission.CAMERA </dev/null || true
  adb -s "$DEV" shell pm grant com.openchat.mobile android.permission.RECORD_AUDIO </dev/null || true
  # POST_NOTIFICATIONS is runtime on Android 13+; expo-notifications prompts for it and the
  # permissioncontroller dialog steals focus, failing every subsequent assertion.
  adb -s "$DEV" shell pm grant com.openchat.mobile android.permission.POST_NOTIFICATIONS </dev/null || true
  # macOS has no GNU `timeout` and gtimeout needs coreutils, so implement the deadline
  # in bash. This is not optional: a single hung flow blocks the whole run, and with four
  # devices running concurrently one hang stalls every downstream wait indefinitely.
  # Provision a fresh isolated world for this flow
  provision_world "$base" || { echo "FAIL $base :: provision failed" | tee -a "$OUT"; VERDICT_COUNT=$((VERDICT_COUNT + 1)); continue; }
  maestro --device "$DEV" test "${MAESTRO_ENV_ARGS[@]}" "$f" >"/tmp/e2e-$base-$DEV.log" 2>&1 </dev/null &
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
  ec=$?
  VERDICT_COUNT=$((VERDICT_COUNT + 1))
  if [ "$ec" -eq 0 ]; then
    echo "PASS $base" | tee -a "$OUT"
  else
    # capture what was actually on screen — makes the later repair pass trivial
    #
    # The PNG matters as much as the XML. A hierarchy dump says an element
    # exists; only a picture says whether a human could see it. Two verdicts
    # on 2026-07-27 turned on exactly that difference: voice-pill "still
    # visible" after disconnect was a 5px sliver mid-dismissal animation, and
    # a rail item Maestro "could not find" was plainly on screen. Both were
    # called defects from XML alone, and both were wrong.
    #
    # Maestro writes its own screenshots under ~/.maestro/tests/<timestamp>/,
    # but that path is not correlated with the flow name, so it is useless
    # during triage. Capturing here keeps the artifact next to its verdict.
    adb -s "$DEV" shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 </dev/null
    adb -s "$DEV" pull /sdcard/ui.xml "/tmp/e2e-$base-$DEV-ui.xml" >/dev/null 2>&1 </dev/null
    adb -s "$DEV" exec-out screencap -p > "/tmp/e2e-$base-$DEV-fail.png" 2>/dev/null </dev/null
    if [ -s "/tmp/e2e-$base-$DEV-fail.png" ]; then
      echo "         screenshot: /tmp/e2e-$base-$DEV-fail.png" | tee -a "$OUT"
    else
      rm -f "/tmp/e2e-$base-$DEV-fail.png"
      echo "         WARNING: screenshot capture failed on $DEV" | tee -a "$OUT"
    fi
    grep -oE 'resource-id="[^"]*"' "/tmp/e2e-$base-$DEV-ui.xml" 2>/dev/null \
      | sed 's/resource-id="//;s/"$//' | sort -u > "/tmp/e2e-$base-$DEV-ids.txt"
    reason=$(grep -oE "Assertion is false[^\"]{0,60}|Element not found[^\"]{0,60}" "/tmp/e2e-$base-$DEV.log" | head -1)
    echo "FAIL $base :: ${reason:-see log}" | tee -a "$OUT"
  fi
done 3< "$LIST"

SKIP_COUNT=$(grep -c '^SKIP ' "$OUT" 2>/dev/null || echo 0)
PASS_COUNT=$(grep -c '^PASS ' "$OUT" 2>/dev/null || echo 0)
FAIL_COUNT=$(grep -c '^FAIL ' "$OUT" 2>/dev/null || echo 0)
TIMEOUT_COUNT=$(grep -c '^TIMEOUT ' "$OUT" 2>/dev/null || echo 0)
echo "--- $DEV done: $PASS_COUNT passed, $FAIL_COUNT failed, $TIMEOUT_COUNT timed out, $SKIP_COUNT skipped ---" | tee -a "$OUT"

# ══════════════════════════════════════════════════════════════════════
# VERDICT RECONCILIATION — every flow must produce exactly one verdict line
# ══════════════════════════════════════════════════════════════════════
# Two independent checks:
# 1. File-based: count verdict lines in the output file (catches I/O failures —
#    tee dying mid-run, disk full, pipe broken — where VERDICT_COUNT was
#    incremented in memory but the line never landed on disk).
# 2. In-memory: compare VERDICT_COUNT vs FLOW_COUNT (catches code-path bugs —
#    a branch that runs without incrementing the counter).
# The file is what humans and downstream tools read; it is the denominator.
FILE_VERDICT_COUNT=$(grep -cE '^(PASS|FAIL|TIMEOUT|SKIP) ' "$OUT" 2>/dev/null || echo 0)
RECONCILE_FAIL=0
if [ "$FILE_VERDICT_COUNT" -ne "$FLOW_COUNT" ]; then
  echo "FATAL: file verdict lines ($FILE_VERDICT_COUNT) != flow count ($FLOW_COUNT)" | tee -a "$OUT"
  RECONCILE_FAIL=1
fi
if [ "$VERDICT_COUNT" -ne "$FLOW_COUNT" ]; then
  echo "FATAL: in-memory verdict_count=$VERDICT_COUNT != flow_count=$FLOW_COUNT" | tee -a "$OUT"
  RECONCILE_FAIL=1
fi
if [ "$RECONCILE_FAIL" -ne 0 ]; then
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    b=$(basename "$f" .yaml)
    if ! grep -qE "^(PASS|FAIL|TIMEOUT|SKIP) $b" "$OUT"; then
      echo "  MISSING VERDICT: $b" | tee -a "$OUT"
    fi
  done < "$LIST"
  exit 2
fi

# TIMEOUT and FAIL are both non-zero exits — neither counts as "pass".
if [ "$FAIL_COUNT" -gt 0 ] || [ "$TIMEOUT_COUNT" -gt 0 ]; then
  exit 1
fi
