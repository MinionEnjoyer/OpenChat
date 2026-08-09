#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
workflow="$root/.github/workflows/container-release.yml"
compose="$root/docker-compose.public.yml"

require_text() {
  local file=$1
  local expected=$2
  if ! grep -Fq -- "$expected" "$file"; then
    echo "Missing expected public-container contract in ${file#$root/}: $expected" >&2
    exit 1
  fi
}

require_text "$workflow" "workflow_run:"
require_text "$workflow" "github.event.workflow_run.conclusion == 'success'"
require_text "$workflow" "github.event.workflow_run.head_branch == 'main'"
require_text "$workflow" 'ref: ${{ github.event.workflow_run.head_sha }}'
require_text "$workflow" "platforms: linux/amd64,linux/arm64"
require_text "$workflow" "ghcr.io/minionenjoyer/openchat-api"
require_text "$workflow" "ghcr.io/minionenjoyer/openchat-web"
require_text "$workflow" 'vars.DOCKERHUB_USERNAME'
require_text "$workflow" 'vars.DOCKERHUB_NAMESPACE'
require_text "$workflow" 'secrets.DOCKERHUB_TOKEN'
require_text "$workflow" 'docker buildx imagetools create'
require_text "$workflow" 'dockerhub_repository: openchat-api'
require_text "$workflow" 'dockerhub_repository: openchat-web'
require_text "$workflow" 'docs/dockerhub/openchat-api.md'
require_text "$workflow" 'docs/dockerhub/openchat-web.md'
require_text "$workflow" 'peter-evans/dockerhub-description@1b9a80c056b620d92cedb9d9b5a223409c68ddfa'
require_text "$workflow" 'short-description: ${{ matrix.dockerhub_short_description }}'
require_text "$workflow" "push-to-registry: true"
require_text "$root/docs/dockerhub/openchat-api.md" "# OpenChat API"
require_text "$root/docs/dockerhub/openchat-web.md" "# OpenChat Web"
require_text "$compose" '${OPENCHAT_API_IMAGE:-ghcr.io/minionenjoyer/openchat-api}:${OPENCHAT_VERSION:-latest}'
require_text "$compose" '${OPENCHAT_WEB_IMAGE:-ghcr.io/minionenjoyer/openchat-web}:${OPENCHAT_VERSION:-latest}'
require_text "$compose" 'livekit/livekit-server:latest'

echo "Public container release scaffold is valid."
