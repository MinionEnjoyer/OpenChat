#!/usr/bin/env bash
# setup-android-toolchain.sh — install Android SDK + emulator + Maestro
# for macOS/arm64 (Apple Silicon) on OpenChat E2E rig.
# Pinned versions: cmdline-tools 11.0, API 34, arm64-v8a system image.
set -euo pipefail

echo "=== Toolchain installation for OpenChat E2E rig ==="
echo ""

# ── Java 17 (required by sdkmanager) ──
echo "[1/6] Java 17…"
export JAVA_HOME="/opt/homebrew/opt/openjdk@17"
export PATH="$JAVA_HOME/bin:$PATH"
java -version 2>&1 | head -1

# ── Android SDK root ──
ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}"
mkdir -p "$ANDROID_SDK_ROOT"
echo "ANDROID_SDK_ROOT=$ANDROID_SDK_ROOT"

# ── Command-line tools ──
echo "[2/6] Android command-line tools (11076708)…"
CMDLINE_ZIP="/tmp/cmdline-tools.zip"
CMDLINE_DIR="$ANDROID_SDK_ROOT/cmdline-tools/latest"

if [ -f "$CMDLINE_DIR/bin/sdkmanager" ]; then
  echo "  ✓ Already installed"
else
  curl -sL -o "$CMDLINE_ZIP" "https://dl.google.com/android/repository/commandlinetools-mac-11076708_latest.zip"
  echo "  Downloaded: $(ls -lh "$CMDLINE_ZIP" | awk '{print $5}')"
  unzip -qo "$CMDLINE_ZIP" -d "$ANDROID_SDK_ROOT/cmdline-tools"
  mv "$ANDROID_SDK_ROOT/cmdline-tools/cmdline-tools" "$CMDLINE_DIR" 2>/dev/null || true
  rm -f "$CMDLINE_ZIP"
fi

SDKMANAGER="$CMDLINE_DIR/bin/sdkmanager"
export ANDROID_SDK_ROOT
export ANDROID_HOME="$ANDROID_SDK_ROOT"

echo "  sdkmanager version: $($SDKMANAGER --version)"

# ── Accept licenses ──
echo "[3/6] Accepting Android SDK licenses…"
yes | $SDKMANAGER --sdk_root="$ANDROID_SDK_ROOT" --licenses > /dev/null 2>&1 || true
echo "  ✓ Licenses accepted"

# ── Platform tools + emulator ──
echo "[4/6] Installing platform-tools + emulator…"
$SDKMANAGER --sdk_root="$ANDROID_SDK_ROOT" "platform-tools" "emulator" > /dev/null 2>&1
echo "  ✓ Installed"

# ── System image (arm64-v8a, API 34) ──
echo "[5/6] Installing system image (arm64-v8a, API 34)…"
$SDKMANAGER --sdk_root="$ANDROID_SDK_ROOT" "system-images;android-34;google_apis;arm64-v8a" > /dev/null 2>&1
echo "  ✓ Installed"

# ── Maestro ──
echo "[6/6] Installing Maestro (curl install)…"
if command -v maestro &>/dev/null; then
  echo "  ✓ Maestro already installed: $(maestro --version 2>&1 | head -1)"
else
  curl -sL "https://get.maestro.mobile.dev" | bash 2>&1 | tail -3
  export PATH="$HOME/.maestro/bin:$PATH"
  echo "  ✓ Installed: $(maestro --version 2>&1 | head -1)"
fi

# ── Summary ──
echo ""
echo "=== Installation complete ==="
echo "Add these to your shell profile (~/.zshrc):"
echo "  export JAVA_HOME=/opt/homebrew/opt/openjdk@17"
echo "  export ANDROID_HOME=\$HOME/Library/Android/sdk"
echo "  export ANDROID_SDK_ROOT=\$ANDROID_HOME"
echo "  export PATH=\"\$JAVA_HOME/bin:\$ANDROID_HOME/cmdline-tools/latest/bin:\$ANDROID_HOME/platform-tools:\$ANDROID_HOME/emulator:\$HOME/.maestro/bin:\$PATH\""
echo ""
echo "Then test with:"
echo "  adb version"
echo "  emulator -version"
echo "  maestro --version"