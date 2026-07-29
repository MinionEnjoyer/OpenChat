#!/usr/bin/env bash
# notif-live-probe.sh — two real clients, timed messages, evidence of what arrives.
#
#   bash tools/notif-live-probe.sh <recipient-device> <sender-device>
#
# Signs the recipient in on one device and the sender on another, confirms both
# reached the app shell, then sends messages from the sender every 10s for a
# minute across three delivery paths — shared channel, @mention in that channel,
# and DM — screenshotting the recipient after each.
#
# WHAT THIS CAN AND CANNOT PROVE
# ------------------------------
# FCM is not configured in this environment: apps/api/.env has no
# FCM_SERVICE_ACCOUNT, so the API loads NoopPushTransport and sends nothing, and
# there is no google-services.json, so the client cannot obtain a token. System
# notifications — background and lock screen — therefore CANNOT arrive, and a
# negative result there is meaningless until both are supplied.
#
# In-app delivery does not use FCM. It rides the WebSocket the connected client
# already holds, so it is fully testable now, and the owner reported in-app
# popups failing too. That is the half this probe measures.
#
# The screenshots are the point. An assertion on a testID cannot tell whether a
# banner was visible, legible, or on screen long enough to read.
set -uo pipefail

RECIPIENT="${1:?recipient device serial}"
SENDER="${2:?sender device serial}"

cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 2
source tools/env.sh 2>/dev/null || true
source tools/e2e-provision.sh

OUT=/tmp/notif-probe
rm -rf "$OUT"; mkdir -p "$OUT"
APP=com.openchat.mobile
API="${API_BASE:-http://127.0.0.1:3030/api}"

log() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$OUT/log.txt"; }

for D in "$RECIPIENT" "$SENDER"; do
  adb devices | awk '$2=="device"{print $1}' | grep -qx "$D" \
    || { log "ABORT: $D not attached"; exit 3; }
  [ "$(adb -s "$D" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r ')" = "1" ] \
    || { log "ABORT: $D not booted"; exit 3; }
  adb -s "$D" reverse tcp:3030 tcp:3030 >/dev/null 2>&1
done

provision_world "notif" || { log "ABORT: provisioning failed"; exit 1; }
log "world: server='${E2E_SERVER_NAME}' channel='${E2E_CHANNEL_GENERAL}'"
log "recipient=${E2E_USERNAME} on $RECIPIENT | sender=${E2E_FRIEND_USERNAME} on $SENDER"

# ── Sign both clients in ──
for pair in "$RECIPIENT:_login.yaml" "$SENDER:_login_friend.yaml"; do
  D="${pair%%:*}"; FLOW="apps/mobile/e2e/flows/${pair##*:}"
  adb -s "$D" shell pm clear "$APP" >/dev/null 2>&1
  adb -s "$D" shell pm grant "$APP" android.permission.POST_NOTIFICATIONS >/dev/null 2>&1
  log "signing in on $D via $(basename "$FLOW")"
  maestro --device "$D" test "${MAESTRO_ENV_ARGS[@]}" "$FLOW" > "$OUT/login-$D.log" 2>&1
  rc=$?
  if [ $rc -ne 0 ]; then
    log "ABORT: sign-in failed on $D (rc=$rc) — see $OUT/login-$D.log"
    adb -s "$D" exec-out screencap -p > "$OUT/login-fail-$D.png" 2>/dev/null
    exit 1
  fi
  log "  signed in on $D"
done

# ── Confirm both are actually connected, not merely launched ──
for D in "$RECIPIENT" "$SENDER"; do
  adb -s "$D" shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
  adb -s "$D" pull /sdcard/ui.xml "$OUT/shell-$D.xml" >/dev/null 2>&1
  if grep -q 'resource-id="shell-screen"' "$OUT/shell-$D.xml" 2>/dev/null; then
    log "  $D: app shell present (connected)"
  else
    log "  WARNING: $D is not showing shell-screen"
  fi
done

send() { # <label> <json-body> <path>
  local label="$1" body="$2" path="$3"
  local code
  code=$(curl -s -o "$OUT/resp-$label.json" -w '%{http_code}' --max-time 10 \
    -X POST -H 'Content-Type: application/json' \
    -H "Authorization: Bearer ${E2E_FRIEND_TOKEN}" \
    -d "$body" "$API$path")
  log "  sent $label -> HTTP $code"
}

shot() { # <label>
  sleep 3   # let any banner render before capturing
  adb -s "$RECIPIENT" exec-out screencap -p > "$OUT/$1.png" 2>/dev/null
  log "  captured $1.png"
}

# ── Six sends, 10s apart, two per delivery path ──
CH="${E2E_CHANNEL_GENERAL_ID}"
DM="${E2E_DM_CHANNEL_ID}"
log "=== sending: 2 plain, 2 @mention, 2 DM — 10s apart ==="

for i in 1 2; do
  send "channel-$i" "{\"content\":\"probe plain #$i $(date +%H:%M:%S)\"}" "/channels/$CH/messages"
  shot "channel-$i"; sleep 7
done
for i in 1 2; do
  send "mention-$i" "{\"content\":\"@${E2E_USERNAME} probe mention #$i $(date +%H:%M:%S)\"}" "/channels/$CH/messages"
  shot "mention-$i"; sleep 7
done
for i in 1 2; do
  send "dm-$i" "{\"content\":\"probe DM #$i $(date +%H:%M:%S)\"}" "/channels/$DM/messages"
  shot "dm-$i"; sleep 7
done

# ── Did the API even try to push? NoopPushTransport says so out loud. ──
log "=== push transport behaviour (API log) ==="
grep -iE "push|fcm|notif" /tmp/api-restart.log 2>/dev/null | tail -8 | tee -a "$OUT/log.txt"

log "done — screenshots and log in $OUT"
ls -1 "$OUT"/*.png 2>/dev/null | sed 's/^/  /' | tee -a "$OUT/log.txt"
