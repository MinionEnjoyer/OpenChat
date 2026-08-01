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
  case "$f" in
    .env.example|.env.dev.example) ;;
    *) echo "✗ tracked env file that isn't an approved template: $f"; fail=1 ;;
  esac
done < <(git ls-files '.env*' 2>/dev/null)

# 2) Grep tracked files for obvious secret assignments or public IPv4s.
#    Templates, the tmpl, and docs (prose) are excluded; RFC1918/loopback are allowed.
scan=$(git grep -nIE \
  -e '(SESSION_SECRET|OIDC_CLIENT_SECRET|LIVEKIT_API_SECRET|POSTGRES_PASSWORD|SHARE_API_KEY|GIPHY_API_KEY)[:=][[:space:]]*[A-Za-z0-9_./+-]{12,}' \
  -e '\b([0-9]{1,3}\.){3}[0-9]{1,3}\b' \
  -- . ':(exclude).env.example' ':(exclude)livekit.yaml.tmpl' ':(exclude)docs/**' ':(exclude)**/package-lock.json' 2>/dev/null \
  | grep -viE 'CHANGE_ME|example|placeholder|unused|not-for-prod|ci-test-|dev-|devsecret|secretsecret|127\.0\.0\.1|0\.0\.0\.0|::1|192\.168\.|10\.[0-9]|172\.(1[6-9]|2[0-9]|3[01])\.|192\.0\.2\.|198\.51\.100\.|203\.0\.113\.|"(java|android_sdk|emulator|maestro|adb)"|subnet' \
  || true)
if [ -n "$scan" ]; then
  scan_count=$(printf '%s\n' "$scan" | wc -l | tr -d ' ')
  scan_locations=$(printf '%s\n' "$scan" | awk -F: '{ print $1 ":" $2 }' | sort -u | paste -sd, -)
  echo "⚠ Possible secret or public IP in tracked files: count=$scan_count locations=$scan_locations"
  echo "::error title=Secret scan blocked::tracked candidates=$scan_count locations=$scan_locations"
  fail=1
fi

if [ "$fail" -eq 0 ]; then
  node tools/security/scan-git-history.mjs || fail=1
fi

if [ "$fail" -eq 0 ]; then
  echo "✓ Clean — no tracked or historical secrets/public IPs detected. Safe to push."
else
  echo "✗ Resolve the items above before pushing."
  exit 1
fi
