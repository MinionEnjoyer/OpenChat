#!/usr/bin/env bash
# prove-rig.sh — Boot emulator, run smoke flow, prove gate catches failure
# Usage: bash tools/prove-rig.sh
# Requires: setup-android-toolchain.sh complete, dev stack running
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export JAVA_HOME="/opt/homebrew/opt/openjdk@17"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$HOME/.maestro/bin:$PATH"

AVD_NAME="OpenChat_Pixel6a_API34"
FLOW_FILE="$ROOT/apps/mobile/e2e/flows/p0-smoke-hello.yaml"
ARTIFACTS_DIR="$ROOT/artifacts/e2e"

echo "===== PROVE THE RIG ====="
echo ""
echo "=== Toolchain check ==="
echo "  adb: $(adb version 2>&1 | head -1)"
echo "  emulator: $(emulator -version 2>&1 | head -1)"
echo "  maestro: $(maestro --version 2>&1 | head -1)"
echo "  AVD: $(avdmanager list avd 2>/dev/null | grep -c 'Name:') available"
echo ""

# ── 1. Boot single emulator on :5554 ──
echo "=== 1. Booting emulator on port 5554 ==="
echo "  (This takes 60-120s on first cold boot with -wipe-data)"

# Kill any existing emulators
adb devices 2>/dev/null | grep 'emulator-' | cut -f1 | while read -r dev; do
  adb -s "$dev" emu kill 2>/dev/null || true
done
sleep 3

# Boot in background
emulator \
  -avd "$AVD_NAME" \
  -port 5554 \
  -no-snapshot \
  -no-boot-anim \
  -gpu swiftshader_indirect \
  -memory 2048 \
  -netdelay none \
  -netspeed full \
  -wipe-data \
  &>/tmp/emulator-5554.log &
EMULATOR_PID=$!

echo "  emulator PID: $EMULATOR_PID"
echo "  waiting for boot…"

# Wait for boot
adb -s emulator-5554 wait-for-device 2>/dev/null
BOOT_TIMEOUT=180
ELAPSED=0
while [ $ELAPSED -lt $BOOT_TIMEOUT ]; do
  STATUS=$(adb -s emulator-5554 shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || echo "")
  if [ "$STATUS" = "1" ]; then
    sleep 5
    echo "  ✓ emulator-5554 booted successfully ($ELAPSED s)"
    break
  fi
  sleep 3
  ELAPSED=$((ELAPSED + 3))
  if [ $((ELAPSED % 15)) -eq 0 ]; then
    echo "    still waiting… (${ELAPSED}s)"
  fi
done

if [ "$STATUS" != "1" ]; then
  echo "  ✗ emulator failed to boot within ${BOOT_TIMEOUT}s"
  cat /tmp/emulator-5554.log | tail -20
  exit 1
fi

# ── 2. Run smoke flow (should pass) ──
echo ""
echo "=== 2. Running smoke flow: p0-smoke-hello.yaml ==="
E2E=1 maestro test "$FLOW_FILE" 2>&1 || {
  echo "  ✗ Smoke flow FAILED — rig is broken"
  exit 1
}
echo "  ✓ Smoke flow PASSED"

# ── 3. Break the assertion, prove gate catches it ──
echo ""
echo "=== 3. Proving gate catches failure ==="
cp "$FLOW_FILE" "$FLOW_FILE.prove-bak"
# Replace assertVisible "Settings" with "DefinitelyNotVisible"
sed -i '' 's/assertVisible: "Settings"/assertVisible: "DefinitelyNotVisible"/' "$FLOW_FILE"

echo "  Running with broken assertion…"
set +e
E2E=1 maestro test "$FLOW_FILE" 2>&1
BROKEN_RC=$?
set -e

# Restore original
mv "$FLOW_FILE.prove-bak" "$FLOW_FILE"

if [ "$BROKEN_RC" -ne 0 ]; then
  echo "  ✓ Gate correctly caught the broken assertion (exit=$BROKEN_RC)"
else
  echo "  ✗ Gate did NOT catch the broken assertion — this means the flow is vacuous"
  exit 1
fi

# ── 4. Run smoke flow again to confirm revert passes ──
echo ""
echo "=== 4. Re-verify after revert ==="
E2E=1 maestro test "$FLOW_FILE" 2>&1
echo "  ✓ Smoke flow PASSED after revert"

# ── 5. Write last-run.json ──
echo ""
echo "=== 5. Writing artifacts/e2e/last-run.json ==="
mkdir -p "$ARTIFACTS_DIR"
cat > "$ARTIFACTS_DIR/last-run.json" <<JSON
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "flow": "p0-smoke-hello",
  "device": "emulator-5554",
  "result": "pass",
  "host": {
    "os": "$(uname -s)",
    "arch": "$(uname -m)",
    "ram_gb": "$(sysctl hw.memsize 2>/dev/null | awk '{printf "%.0f", $2/1024/1024/1024}' || echo 'unknown')"
  },
  "gate_proof": {
    "broken_assertion_caught": true,
    "revert_pass": true
  }
}
JSON
echo "  ✓ Written"

# ── 6. RAM report ──
echo ""
echo "=== 6. RAM usage ==="
ps aux | grep -i '[e]mulator' | awk '{print $6/1024 " MB RSS"}'
echo ""

echo "===== RIG PROVEN ====="
echo "  Smoke flow: PASS"
echo "  Gate catches failure: PASS"
echo "  last-run.json: artifacts/e2e/last-run.json"