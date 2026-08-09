#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
compose="$root/docker-compose.dev.yml"
env_example="$root/.env.dev.example"

require_text() {
  local file=$1
  local expected=$2
  if ! grep -Fq -- "$expected" "$file"; then
    echo "Missing expected development Compose contract in ${file#$root/}: $expected" >&2
    exit 1
  fi
}

# OpenShare publishes container port 8000 as host port 8800. Service-to-service
# traffic must use the container port or OpenChat uploads fail with a 502.
require_text "$compose" 'SHARE_BASE_URL: http://openshare:8000'
require_text "$compose" '"8800:8000"'
require_text "$env_example" 'SHARE_BASE_URL=http://openshare:8000'

if grep -Fq -- 'SHARE_BASE_URL: http://openshare:8800' "$compose"; then
  echo "OpenChat must not use OpenShare's host-mapped port inside Compose." >&2
  exit 1
fi

echo "Development Compose service wiring is valid."
