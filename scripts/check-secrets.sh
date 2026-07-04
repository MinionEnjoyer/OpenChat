#!/usr/bin/env bash
# Pre-push safety net: verify no secret files or obvious secrets are tracked by git.
# Run before every push:  ./scripts/check-secrets.sh
set -uo pipefail
cd "$(dirname "$0")/.."
fail=0

# 1) Secret / local-config files must never be tracked.
for f in .env livekit.yaml; do
  if git ls-files --error-unmatch "$f" >/dev/null 2>&1; then
    echo "✗ '$f' is tracked — untrack it:  git rm --cached $f"; fail=1
  fi
done
while IFS= read -r f; do
  [ -z "$f" ] && continue
  [ "$f" = ".env.example" ] || { echo "✗ tracked env file that isn't the template: $f"; fail=1; }
done < <(git ls-files '.env*' 2>/dev/null)

# 2) Grep tracked files for obvious secret assignments or public IPv4s.
#    Templates, the tmpl, and docs (prose) are excluded; RFC1918/loopback are allowed.
scan=$(git grep -nIE \
  -e '(SESSION_SECRET|OIDC_CLIENT_SECRET|LIVEKIT_API_SECRET|POSTGRES_PASSWORD|SHARE_API_KEY|GIPHY_API_KEY)[:=][[:space:]]*[A-Za-z0-9_./+-]{12,}' \
  -e '\b([0-9]{1,3}\.){3}[0-9]{1,3}\b' \
  -- . ':(exclude).env.example' ':(exclude)livekit.yaml.tmpl' ':(exclude)docs/**' ':(exclude)**/package-lock.json' 2>/dev/null \
  | grep -viE 'CHANGE_ME|example|placeholder|unused|127\.0\.0\.1|0\.0\.0\.0|::1|192\.168\.|10\.[0-9]|172\.(1[6-9]|2[0-9]|3[01])\.|10\.106\.0\.0|subnet' \
  || true)
if [ -n "$scan" ]; then
  echo "⚠ Possible secret or public IP in tracked files — review each line:"
  echo "$scan"
  fail=1
fi

if [ "$fail" -eq 0 ]; then
  echo "✓ Clean — no tracked secrets or public IPs detected. Safe to push."
else
  echo "✗ Resolve the items above before pushing."
  exit 1
fi
