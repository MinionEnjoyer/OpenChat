#!/usr/bin/env bash
# One-time (and re-runnable) setup: create .env from the template if missing, then
# render livekit.yaml from livekit.yaml.tmpl using the values in .env.
# Usage:  ./scripts/setup.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  cp .env.example .env
  echo "→ Created .env from .env.example."
  echo "  Edit .env and replace every CHANGE_ME, then run ./scripts/setup.sh again."
  exit 1
fi

# Load .env into the environment.
set -a; . ./.env; set +a

: "${LIVEKIT_NODE_IP:?set LIVEKIT_NODE_IP in .env}"
: "${LIVEKIT_API_KEY:?set LIVEKIT_API_KEY in .env}"
: "${LIVEKIT_API_SECRET:?set LIVEKIT_API_SECRET in .env}"

# Render livekit.yaml (only substitute the three LiveKit vars).
if command -v envsubst >/dev/null 2>&1; then
  envsubst '${LIVEKIT_NODE_IP} ${LIVEKIT_API_KEY} ${LIVEKIT_API_SECRET}' \
    < livekit.yaml.tmpl > livekit.yaml
else
  sed -e "s|\${LIVEKIT_NODE_IP}|${LIVEKIT_NODE_IP}|g" \
      -e "s|\${LIVEKIT_API_KEY}|${LIVEKIT_API_KEY}|g" \
      -e "s|\${LIVEKIT_API_SECRET}|${LIVEKIT_API_SECRET}|g" \
      livekit.yaml.tmpl > livekit.yaml
fi

echo "→ Rendered livekit.yaml from .env ✓"
echo "→ Ready. Start the stack with:  docker compose up -d --build"
