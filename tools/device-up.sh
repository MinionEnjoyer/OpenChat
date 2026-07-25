#!/usr/bin/env bash
# device-up.sh — Android emulator provisioning for OpenChat E2E
# Usage: ./tools/device-up.sh [--second]   (called by devctl device up)
# Requires: Android SDK (API 34)
#
# Host detection:
#   macOS/arm64 → Hypervisor.framework (HVF, built-in — no check needed)
#   Linux/x86_64 → KVM (/dev/kvm required)
#   Other → unsupported, exits 1 with reason
#
# System image:
#   macOS/arm64 → arm64-v8a (x86_64 images cannot run on Apple Silicon)
#   Linux/x86_64 → x86_64 (Google APIs)
#   CI on ubuntu-latest uses the Linux/x86_64 path.
#
# Creates a Pixel 6a AVD if needed, boots it with cold-start determinism,
# optionally boots a second instance on :5556 for two-client flows.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AVD_NAME="OpenChat_Pixel6a_API34"
SECOND="${1:-}"

# ── Host detection ──────────────────────────────────────────────────────

detect_host() {
  local os arch
  os=$(uname -s)
  arch=$(uname -m)

  case "$os-$arch" in
    Darwin-arm64)
      HOST_VIRT="hvf"
      HOST_IMAGE_ARCH="arm64-v8a"
      HOST_GPU="swiftshader_indirect"
      ;;
    Darwin-x86_64)
      HOST_VIRT="hvf"
      HOST_IMAGE_ARCH="x86_64"
      HOST_GPU="swiftshader_indirect"
      ;;
    Linux-x86_64)
      HOST_VIRT="kvm"
      HOST_IMAGE_ARCH="x86_64"
      HOST_GPU="swiftshader_indirect"
      ;;
    Linux-aarch64)
      HOST_VIRT="kvm"
      HOST_IMAGE_ARCH="arm64-v8a"
      HOST_GPU="swiftshader_indirect"
      ;;
    *)
      echo "✗ Unsupported host: $os/$arch"
      echo "  device-up.sh requires macOS (arm64/x86_64) with HVF or Linux (x86_64/aarch64) with KVM"
      echo "  CI runs on ubuntu-latest (Linux/x86_64 + KVM)."
      return 1
      ;;
  esac

  SYSTEM_IMAGE="system-images;android-34;google_apis;${HOST_IMAGE_ARCH}"
  export HOST_VIRT HOST_IMAGE_ARCH HOST_GPU SYSTEM_IMAGE
}

# ── Prerequisites ────────────────────────────────────────────────────────

check_prereqs() {
  if ! command -v emulator &>/dev/null; then
    echo "✗ Android emulator not found on PATH"
    echo "  Install via sdkmanager: sdkmanager 'emulator' 'platform-tools'"
    return 1
  fi
  if ! command -v adb &>/dev/null; then
    echo "✗ adb not found on PATH"
    return 1
  fi

  # Linux: KVM required
  if [ "$HOST_VIRT" = "kvm" ]; then
    if [ ! -e /dev/kvm ]; then
      echo "✗ /dev/kvm not available — KVM required for emulator acceleration on Linux"
      echo "  Enable hardware virtualization in BIOS or install KVM"
      return 1
    fi
    if [ ! -r /dev/kvm ] || [ ! -w /dev/kvm ]; then
      echo "✗ /dev/kvm not readable/writable — check permissions (user in kvm group?)"
      return 1
    fi
  fi

  # macOS: HVF is built-in, no device node to check.
  # Confirm the emulator binary supports the host arch by asking for its ABI list.
  if [ "$HOST_VIRT" = "hvf" ]; then
    echo "  ✓ Host: macOS ($HOST_IMAGE_ARCH) — Hypervisor.framework (HVF) available"
  fi

  return 0
}

# ── AVD creation ─────────────────────────────────────────────────────────

ensure_avd() {
  if avdmanager list avd 2>/dev/null | grep -q "$AVD_NAME"; then
    echo "  ✓ AVD '$AVD_NAME' already exists"
    return 0
  fi

  echo "  → Creating AVD '$AVD_NAME' with image: $SYSTEM_IMAGE"
  echo "no" | avdmanager create avd \
    -n "$AVD_NAME" \
    -k "$SYSTEM_IMAGE" \
    -d "pixel_6a" \
    --force 2>&1
  echo "  ✓ AVD '$AVD_NAME' created"
}

# ── Emulator boot ────────────────────────────────────────────────────────

boot_emulator() {
  local port="${1:-5554}"
  local read_only="${2:-false}"
  local serial="emulator-$port"

  echo "  → Booting emulator on port $port (arch=$HOST_IMAGE_ARCH, virt=$HOST_VIRT)…"
  local extra_flags="-wipe-data"
  if [ "$read_only" = "true" ]; then
    extra_flags="-read-only"
  fi
  emulator \
    -avd "$AVD_NAME" \
    -port "$port" \
    -no-snapshot \
    -no-boot-anim \
    -gpu "$HOST_GPU" \
    -memory 2048 \
    -netdelay none \
    -netspeed full \
    $extra_flags \
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

# ── Main ─────────────────────────────────────────────────────────────────

detect_host
check_prereqs
ensure_avd

# Kill any running emulators first
adb devices 2>/dev/null | grep 'emulator-' | cut -f1 | while read -r dev; do
  adb -s "$dev" emu kill 2>/dev/null || true
done
sleep 2

if [ "$SECOND" = "--second" ]; then
  boot_emulator 5556 true
else
  boot_emulator 5554 false
  boot_emulator 5556 true
fi

echo ""
echo "Devices ready:"
adb devices -l 2>/dev/null | grep 'emulator'