#!/usr/bin/env bash
# End-to-end LiveKit credential-rotation regression test.
#
# This deliberately tests more than JWT shape:
#   1. credentials A establish a real WebRTC peer connection;
#   2. LiveKit is recreated with credentials B;
#   3. credentials A are rejected while the server is healthy;
#   4. credentials B establish a real WebRTC peer connection.
set -Eeuo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
image="${LIVEKIT_TEST_IMAGE:-livekit/livekit-server:v1.13.4}"
probe_node_image="${LIVEKIT_PROBE_NODE_IMAGE:-}"
signal_port="${LIVEKIT_TEST_SIGNAL_PORT:-7880}"
rtc_tcp_port="${LIVEKIT_TEST_TCP_PORT:-7881}"
rtc_udp_port="${LIVEKIT_TEST_UDP_PORT:-50000}"
container="openchat-livekit-rotation-${RANDOM}-$$"
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/openchat-livekit-rotation.XXXXXX")"
config_file="$work_dir/livekit.yaml"
log_file="$work_dir/stale-probe.log"
room="rotation-regression-$$"

key_a=devkeyA123456789
secret_a=secretAsecretAsecretAsecretAsecretA12
key_b=devkeyB123456789
secret_b=secretBsecretBsecretBsecretBsecretB12

cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
  rm -rf "$work_dir"
}
trap cleanup EXIT

required_commands=(docker curl)
if [ -z "$probe_node_image" ]; then
  required_commands+=(node)
fi
for command_name in "${required_commands[@]}"; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "FAIL: required command not found: $command_name" >&2
    exit 2
  fi
done

if [ -n "$probe_node_image" ] && [ ! -d "$script_dir/node_modules" ]; then
  docker run --rm \
    --volume "$script_dir:/probe" \
    --workdir /probe \
    "$probe_node_image" npm ci
fi

write_config() {
  local key="$1" secret="$2"
  printf '%s\n' \
    "port: ${signal_port}" \
    'rtc:' \
    "  udp_port: ${rtc_udp_port}" \
    "  tcp_port: ${rtc_tcp_port}" \
    '  use_external_ip: false' \
    '  node_ip: 127.0.0.1' \
    'keys:' \
    "  ${key}: ${secret}" \
    'logging:' \
    '  level: warn' >"$config_file"
  chmod 600 "$config_file"
}

wait_for_server() {
  local http_code
  for _ in $(seq 1 30); do
    http_code="$(curl --silent --show-error --max-time 2 --output /dev/null --write-out '%{http_code}' "http://127.0.0.1:${signal_port}/" 2>/dev/null || true)"
    case "$http_code" in
      200|204|400|404|426) return 0 ;;
    esac
    if ! docker inspect -f '{{.State.Running}}' "$container" 2>/dev/null | grep -qx true; then
      echo 'FAIL: disposable LiveKit server exited during startup' >&2
      docker logs "$container" >&2 || true
      return 1
    fi
    sleep 1
  done
  echo 'FAIL: disposable LiveKit server did not become ready' >&2
  docker logs "$container" >&2 || true
  return 1
}

start_server() {
  local key="$1" secret="$2"
  docker rm -f "$container" >/dev/null 2>&1 || true
  write_config "$key" "$secret"
  docker run --detach --rm \
    --name "$container" \
    --publish "${signal_port}:${signal_port}" \
    --publish "${rtc_tcp_port}:${rtc_tcp_port}" \
    --publish "${rtc_udp_port}:${rtc_udp_port}/udp" \
    --volume "$config_file:/etc/livekit/livekit.yaml:ro" \
    "$image" --config /etc/livekit/livekit.yaml >/dev/null
  wait_for_server
}

probe() {
  local key="$1" secret="$2" identity="$3"
  local probe_args=(
    --room "$room"
    --identity "$identity"
    --connect-only
    --peer-timeout 8
  )
  if [ -n "$probe_node_image" ]; then
    docker run --rm --network host \
      --volume "$script_dir:/probe:ro" \
      --workdir /probe \
      --env "LIVEKIT_URL=ws://127.0.0.1:${signal_port}" \
      --env "LIVEKIT_API_KEY=$key" \
      --env "LIVEKIT_API_SECRET=$secret" \
      "$probe_node_image" node /probe/lk-probe.mjs "${probe_args[@]}"
    return
  fi
  LIVEKIT_URL="ws://127.0.0.1:${signal_port}" \
    LIVEKIT_API_KEY="$key" \
    LIVEKIT_API_SECRET="$secret" \
    node "$script_dir/lk-probe.mjs" "${probe_args[@]}"
}

echo "[rotation-test] starting credential set A with $image"
start_server "$key_a" "$secret_a"
probe "$key_a" "$secret_a" rotation-before

echo '[rotation-test] recreating LiveKit with credential set B'
start_server "$key_b" "$secret_b"

set +e
probe "$key_a" "$secret_a" stale-after-rotation >"$log_file" 2>&1
stale_status=$?
set -e
if [ "$stale_status" -eq 0 ]; then
  echo 'FAIL: stale LiveKit credential still established a peer connection' >&2
  exit 1
fi
echo 'PASS: stale LiveKit credential was rejected after rotation'

probe "$key_b" "$secret_b" rotation-after
echo 'PASS: LiveKit credential rotation preserved real peer connectivity'
