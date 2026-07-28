#!/usr/bin/env bash
# e2e-run-pair.sh — run a two-device A/B flow pair against ONE shared test world.
#
#   bash tools/e2e-run-pair.sh <devA> <devB> <flowA.yaml> <flowB.yaml>
#
# WHY THIS EXISTS
# ---------------
# The six cross-device flows (msg-typing-A/B, msg-pins-cross-device-A/B,
# msg-polls-cross-device-A/B) had never passed, and could not have. Each
# invocation of e2e-run-only.sh calls provision_world itself, so running A and B
# as two separate runs put them in two DIFFERENT seeded worlds — different
# server, different channel, different users. Device A typed into one world
# while device B watched another and saw nothing. The flows were sound; the
# harness made them unsatisfiable.
#
# This runner provisions exactly one world and hands the SAME --env args to both
# devices, which is what the flow headers ask for:
#   "Run concurrently on two devices sharing the same test-world env vars.
#    Start B first so it's waiting, then start A."
#
# B is the observer (waits for an event), A is the actor (causes it). Starting A
# first races: A can finish typing before B is on screen, and the indicator is
# gone by the time B looks.
#
# VERDICT SEMANTICS
# -----------------
# A pair is PASS only if BOTH halves exit 0. A half that passes while its partner
# fails is not a success — the assertion under test spans the two devices.
set -uo pipefail

DEVA="${1:?device A (actor)}"
DEVB="${2:?device B (observer)}"
FLOWA="${3:?flow A yaml}"
FLOWB="${4:?flow B yaml}"

cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 2
source tools/env.sh 2>/dev/null || true
source tools/e2e-provision.sh

PAIR="$(basename "$FLOWA" .yaml)+$(basename "$FLOWB" .yaml)"
OUT="/tmp/e2e-verdicts-pair-$(date +%s).txt"
: > "$OUT"
PER_FLOW_TIMEOUT="${PER_FLOW_TIMEOUT:-240}"
# B is the observer and must outlive A: it is still asserting after A finishes.
B_TIMEOUT=$((PER_FLOW_TIMEOUT + 60))
APP=com.openchat.mobile

echo "[$(date +%H:%M:%S)] PAIR $PAIR  A=$DEVA  B=$DEVB" | tee -a "$OUT"

for f in "$FLOWA" "$FLOWB"; do
  [ -f "$f" ] || { echo "ABORT: no such flow: $f" | tee -a "$OUT"; exit 2; }
done

# ── Preflight both devices (same checks e2e-run-only.sh makes per flow) ──
for D in "$DEVA" "$DEVB"; do
  if ! adb devices | awk '$2=="device"{print $1}' | grep -qx "$D"; then
    echo "ABORT: $D is not attached" | tee -a "$OUT"; exit 3
  fi
  if [ "$(adb -s "$D" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r ')" != "1" ]; then
    echo "ABORT: $D present but not booted" | tee -a "$OUT"; exit 3
  fi
  adb -s "$D" reverse tcp:3030 tcp:3030 >/dev/null 2>&1 \
    || { echo "ABORT: $D could not open reverse tunnel to :3030" | tee -a "$OUT"; exit 3; }
  adb -s "$D" shell pm clear "$APP" </dev/null >/dev/null 2>&1
  adb -s "$D" shell pm grant "$APP" android.permission.POST_NOTIFICATIONS </dev/null >/dev/null 2>&1 || true
done

# ── ONE world, shared by both halves. This is the whole point of the script. ──
provision_world "$PAIR" || { echo "FAIL $PAIR :: provision failed" | tee -a "$OUT"; exit 1; }
echo "[$(date +%H:%M:%S)] world: server=${E2E_SERVER_NAME:-?} general=${E2E_CHANNEL_GENERAL:-?} user=${E2E_USERNAME:-?} friend=${E2E_FRIEND_USERNAME:-?}" | tee -a "$OUT"

LOGA="/tmp/e2e-pair-$(basename "$FLOWA" .yaml)-$DEVA.log"
LOGB="/tmp/e2e-pair-$(basename "$FLOWB" .yaml)-$DEVB.log"

# ── B first: it must be on screen and waiting before A acts. ──
maestro --device "$DEVB" test "${MAESTRO_ENV_ARGS[@]}" "$FLOWB" >"$LOGB" 2>&1 </dev/null &
BPID=$!
echo "[$(date +%H:%M:%S)] B started on $DEVB (observer), settling..." | tee -a "$OUT"
sleep 8

if ! kill -0 "$BPID" 2>/dev/null; then
  wait "$BPID"; brc=$?
  echo "FAIL $PAIR :: observer B exited during settle (rc=$brc) — see $LOGB" | tee -a "$OUT"
  exit 1
fi

maestro --device "$DEVA" test "${MAESTRO_ENV_ARGS[@]}" "$FLOWA" >"$LOGA" 2>&1 </dev/null &
APID=$!
echo "[$(date +%H:%M:%S)] A started on $DEVA (actor)" | tee -a "$OUT"

# ── Bounded waits. macOS has no GNU timeout; same approach as e2e-run-only.sh. ──
# Sets WAIT_RC. Deliberately NOT `RC=$(wait_bounded ...)`: command substitution
# runs in a subshell, where the maestro processes are not children, so `wait`
# fails immediately and reports rc=-1 for a flow that is still running. That
# misread every pair as a failure on the first attempt at this script.
WAIT_RC=0
wait_bounded() {  # pid deadline -> sets WAIT_RC (124 = timed out)
  local pid=$1 deadline=$2 waited=0
  while kill -0 "$pid" 2>/dev/null && [ "$waited" -lt "$deadline" ]; do
    sleep 2; waited=$((waited + 2))
  done
  if kill -0 "$pid" 2>/dev/null; then
    kill -9 "$pid" 2>/dev/null; wait "$pid" 2>/dev/null
    WAIT_RC=124; return
  fi
  wait "$pid"; WAIT_RC=$?
}

wait_bounded "$APID" "$PER_FLOW_TIMEOUT"; ARC=$WAIT_RC
wait_bounded "$BPID" "$B_TIMEOUT";        BRC=$WAIT_RC

reason_for() {  # log -> first real maestro reason
  grep -oE "Assertion is false[^\"]{0,70}|Element not found[^\"]{0,70}" "$1" 2>/dev/null | head -1
}

# Screen state on failure, per device — the pair's whole value is what B saw.
for pairspec in "$DEVA:$(basename "$FLOWA" .yaml):$ARC" "$DEVB:$(basename "$FLOWB" .yaml):$BRC"; do
  D="${pairspec%%:*}"; rest="${pairspec#*:}"; base="${rest%%:*}"; rc="${rest##*:}"
  [ "$rc" = "0" ] && continue
  adb -s "$D" shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 </dev/null
  adb -s "$D" pull /sdcard/ui.xml "/tmp/e2e-$base-$D-ui.xml" >/dev/null 2>&1 </dev/null
done

describe() { case "$1" in 0) echo "ok";; 124) echo "timeout";; *) echo "rc=$1";; esac; }

echo "  A $(basename "$FLOWA" .yaml) on $DEVA: $(describe "$ARC") $(reason_for "$LOGA")" | tee -a "$OUT"
echo "  B $(basename "$FLOWB" .yaml) on $DEVB: $(describe "$BRC") $(reason_for "$LOGB")" | tee -a "$OUT"

if [ "$ARC" = "0" ] && [ "$BRC" = "0" ]; then
  echo "PASS $PAIR" | tee -a "$OUT"; exit 0
fi
echo "FAIL $PAIR :: A=$(describe "$ARC") B=$(describe "$BRC")" | tee -a "$OUT"
exit 1
