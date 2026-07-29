#!/usr/bin/env bash
# Toolchain environment for native Android work (P0-17).
#
# The Android SDK and JDK 17 are installed on this host but neither is on PATH
# for non-interactive shells: JDK 17 is a Homebrew keg that was never linked, and
# ANDROID_HOME is only exported by the user's interactive shell profile. Every
# script that shells out to adb, gradle, or expo prebuild sources this file so
# they all agree on where the toolchain lives.
#
# Usage:  source tools/env.sh

# ── JDK ──────────────────────────────────────────────────────────────
# Prefer an already-exported JAVA_HOME (CI sets its own), then the Homebrew keg,
# then whatever java_home reports.
if [ -z "${JAVA_HOME:-}" ]; then
  if [ -x "/opt/homebrew/opt/openjdk@17/bin/java" ]; then
    export JAVA_HOME="/opt/homebrew/opt/openjdk@17"
  elif /usr/libexec/java_home -v 17 >/dev/null 2>&1; then
    JAVA_HOME="$(/usr/libexec/java_home -v 17)"
    export JAVA_HOME
  fi
fi
[ -n "${JAVA_HOME:-}" ] && export PATH="$JAVA_HOME/bin:$PATH"

# ── Android SDK ──────────────────────────────────────────────────────
if [ -z "${ANDROID_HOME:-}" ]; then
  if [ -d "$HOME/Library/Android/sdk" ]; then
    export ANDROID_HOME="$HOME/Library/Android/sdk"
  elif [ -d "$HOME/Android/Sdk" ]; then
    export ANDROID_HOME="$HOME/Android/Sdk"
  fi
fi
if [ -n "${ANDROID_HOME:-}" ]; then
  export ANDROID_SDK_ROOT="$ANDROID_HOME"
  export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
fi

# ── Reporting ────────────────────────────────────────────────────────
# Callers that need to fail loudly can check these rather than re-deriving.
env_report() {
  echo "JAVA_HOME=${JAVA_HOME:-unset}"
  echo "ANDROID_HOME=${ANDROID_HOME:-unset}"
  echo "java=$(command -v java || echo missing)"
  echo "adb=$(command -v adb || echo missing)"
  echo "emulator=$(command -v emulator || echo missing)"
}
