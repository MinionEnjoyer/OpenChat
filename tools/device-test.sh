#!/usr/bin/env bash
# device-test.sh — configure the dev stack + build an APK for PHYSICAL Android devices.
#
# A phone cannot reach the dev machine's localhost, nor the Android emulator's
# 10.0.2.2 alias. THREE separate things must point at the LAN address, and missing
# any one of them fails differently:
#
#   1. app apiBaseUrl / wsUrl  (EXPO_PUBLIC_API_HOST, baked into the bundle)
#        wrong -> app cannot log in at all. Obvious, fails loudly.
#   2. LIVEKIT_URL returned by POST /voice/:id/join
#        wrong -> app cannot open the LiveKit signalling socket. Fails at join.
#   3. LiveKit --node-ip (its advertised ICE candidate for media, UDP 50000)
#        wrong -> SILENT. Signalling succeeds, participants join and appear in the
#        room, and NO AUDIO EVER FLOWS. Nothing in the app looks broken. This is
#        the one that wastes an afternoon.
#
# Usage:
#   tools/device-test.sh                 # auto-detect LAN IP
#   tools/device-test.sh 192.168.1.42    # or pass it explicitly
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

IP="${1:-$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)}"
[ -n "$IP" ] || { echo "Could not detect a LAN IP. Pass one: tools/device-test.sh <ip>"; exit 1; }
echo "→ LAN address: $IP"

# 1. LiveKit must advertise the LAN IP for media, not the compose service name.
echo "→ restarting LiveKit with --node-ip=$IP"
LIVEKIT_NODE_IP="$IP" docker compose -f docker-compose.dev.yml up -d livekit

# 2. The API must hand clients a reachable LiveKit URL.
if grep -q '^LIVEKIT_URL=' apps/api/.env; then
  sed -i '' "s|^LIVEKIT_URL=.*|LIVEKIT_URL=ws://$IP:7880|" apps/api/.env
  echo "→ apps/api/.env LIVEKIT_URL=ws://$IP:7880"
  echo "  (RESTART the API for this to take effect)"
fi

# 3. The app bundle must target the LAN host. EXPO_PUBLIC_* is inlined at build time,
#    so this has to be set for the bundle step, not at runtime.
echo "→ building APK with EXPO_PUBLIC_API_HOST=$IP"
source tools/env.sh 2>/dev/null || true
export JAVA_HOME ANDROID_HOME
cd apps/mobile
EXPO_PUBLIC_API_HOST="$IP" npx expo export --platform android >/dev/null 2>&1 || true
cd android && EXPO_PUBLIC_API_HOST="$IP" ./gradlew assembleRelease

APK="$PWD/app/build/outputs/apk/release/app-release.apk"
echo
echo "APK: $APK"
echo
echo "Install on every connected device:"
echo "  for d in \$(adb devices | grep 'device\$' | awk '{print \$1}'); do adb -s \$d install -r \"$APK\"; done"
echo
echo "REVERT when done (restores emulator/CI defaults):"
echo "  sed -i '' 's|^LIVEKIT_URL=.*|LIVEKIT_URL=ws://localhost:7880|' apps/api/.env"
echo "  docker compose -f docker-compose.dev.yml up -d livekit"
