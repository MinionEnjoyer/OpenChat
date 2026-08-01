#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
fixture="$(mktemp -d)"
cleanup() { rm -rf "$fixture"; }
trap cleanup EXIT

mkdir -p "$fixture/scripts"
cp "$repo_root/livekit.yaml.tmpl" "$fixture/livekit.yaml.tmpl"
cp "$repo_root/scripts/setup.sh" "$fixture/scripts/setup.sh"
chmod +x "$fixture/scripts/setup.sh"

write_env() {
  includes="$1"
  printf '%s\n' \
    'LIVEKIT_NODE_IP=203.0.113.10' \
    'LIVEKIT_API_KEY=testkey' \
    'LIVEKIT_API_SECRET=testsecret' \
    "LIVEKIT_RTC_INTERFACE_INCLUDES=$includes" >"$fixture/.env"
}

write_env '[]'
(cd "$fixture" && ./scripts/setup.sh >/dev/null)
grep -Fq 'includes: []' "$fixture/livekit.yaml"

write_env '[wg0]'
(cd "$fixture" && ./scripts/setup.sh >/dev/null)
grep -Fq 'includes: [wg0]' "$fixture/livekit.yaml"
grep -Fq 'node_ip: 203.0.113.10' "$fixture/livekit.yaml"

echo 'LIVEKIT_CONFIG_RENDER_TEST=passed'
