#!/usr/bin/env bash
# device-up.sh — Android emulator provisioning for OpenChat E2E
# Usage: ./tools/device-up.sh [--second]   (called by devctl device up)
# Requires: Android SDK (API 34), KVM (Linux) or HAXM (macOS)
#
# Creates a Pixel 6a AVD if needed, boots it with cold-start determinism,
# optionally boots a second instance on :5556 for two-client flows.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AVD_NAME="OpenChat_Pixel6a_API34"
SECOND="${1:-}"

# Check prerequisites
check_prereqs() {
  if ! command -v emulator &>/dev/null; then
    echo "✗ Android emulator not found on PATH"
    echo "  Install: Android Studio → SDK Manager → SDK Tools → Android Emulator"
    echo "  Or: sdkmanager 'emulator' 'platform-tools'"
    return 1
  fi
  if ! command -v adb &>/dev/null; then
    echo "✗ adb not found on PATH"
    return 1
  fi
  # Check KVM (Linux) or Hypervisor.framework (macOS)
  if [[ "$(uname)" == "Linux" ]]; then
    if [ ! -e /dev/kvm ]; then
      echo "✗ /dev/kvm not available — KVM required for emulator acceleration"
      echo "  Enable hardware virtualization in BIOS or install KVM"
      return 1
    fi
  fi
  return 0
}

# Create AVD if it doesn't exist
ensure_avd() {
  if avdmanager list avd 2>/dev/null | grep -q "$AVD_NAME"; then
    echo "  ✓ AVD '$AVD_NAME' already exists"
    return 0
  fi
  echo "  → Creating AVD '$AVD_NAME' (system-images;android-34;google_apis;x86_64)…"
  echo "no" | avdmanager create avd \
    -n "$AVD_NAME" \
    -k "system-images;android-34;google_apis;x86_64" \
    -d "pixel_6a" \
    --force 2>&1 || {
    # Fallback: try with ARM image
    echo "  → Trying ARM image…"
    echo "no" | avdmanager create avd \
      -n "$AVD_NAME" \
      -k "system-images;android-34;google_apis;arm64-v8a" \
      -d "pixel_6a" \
      --force 2>&1
  }
  echo "  ✓ AVD '$AVD_NAME' created"
}

# Boot emulator deterministically (no snapshot, fresh boot)
boot_emulator() {
  local port="${1:-5554}"
  local serial="emulator-$port"
  local grpc_port=$((port + 1))

  echo "  → Booting emulator on port $port…"
  emulator \
    -avd "$AVD_NAME" \
    -port "$port" \
    -no-snapshot \
    -no-boot-anim \
    -gpu swiftshader_indirect \
    -memory 2048 \
    -netdelay none \
    -netspeed full \
    -wipe-data \
    &>/dev/null &

  # Wait for boot
  echo "  → Waiting for device $serial to boot…"
  adb -s "$serial" wait-for-device 2>/dev/null
  local boot_timeout=120
  local elapsed=0
  while [ $elapsed -lt $boot_timeout ]; do
    local status
    status=$(adb -s "$serial" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || echo "")
    if [ "$status" = "1" ]; then
      # Wait for package manager to settle
      sleep 5
      echo "  ✓ Device $serial booted"
      return 0
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done
  echo "  ✗ Device $serial failed to boot within ${boot_timeout}s"
  return 1
}

# ── Main ──
check_prereqs
ensure_avd

# Kill any running emulators first
adb devices 2>/dev/null | grep 'emulator-' | cut -f1 | while read -r dev; do
  adb -s "$dev" emu kill 2>/dev/null || true
done
sleep 2

if [ "$SECOND" = "--second" ]; then
  boot_emulator 5556
else
  boot_emulator 5554
  boot_emulator 5556
fi

echo ""
echo "Devices ready:"
adb devices -l 2>/dev/null | grep 'emulator'