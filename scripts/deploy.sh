#!/usr/bin/env bash
# Pull the latest code and roll it out. Run this ON the deployment host,
# from the repo root (e.g. /opt/chat). Local .env + livekit.yaml are never touched
# by git, so your secrets survive every deploy.
#
#   ./scripts/deploy.sh          # pull main + rebuild changed services
#
# The API container runs `prisma migrate deploy` on start, so DB migrations apply
# automatically — no separate step needed.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "→ Fetching latest code…"
git fetch --prune origin
git checkout main
git pull --ff-only origin main

if [ ! -f .env ]; then
  echo "✗ .env is missing. Copy .env.example → .env and fill it in first."; exit 1
fi

# Re-render livekit.yaml only if it doesn't exist yet (never clobber a working one
# unless you deleted it on purpose). Delete livekit.yaml and re-run to force a refresh.
if [ ! -f livekit.yaml ]; then
  echo "→ livekit.yaml missing — rendering from template…"
  ./scripts/setup.sh || true
fi

echo "→ Building + restarting containers…"
docker compose up -d --build

echo "→ Pruning old images…"
docker image prune -f >/dev/null 2>&1 || true

echo "→ Status:"
docker compose ps
echo "✓ Deploy complete."
