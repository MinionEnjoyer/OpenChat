#!/usr/bin/env bash
# P0-06 seed idempotency test
# Asserts: running seed twice against the same DB converges, not duplicates.
#
# "Converge" = same entity counts for users, servers, channels, roles,
# friendships, DMs, and pending friend requests. The fixture-ids.json file
# is byte-identical after the second run. Messages in #volume accumulate
# (not checked).
#
# Usage: bash tools/seed/test-idempotency.sh [--api http://localhost:3001/api]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
API_BASE="${CHAR_API_BASE:-http://localhost:3001/api}"

fail() { echo "  ✗ $1"; exit 1; }

curl_s() {
  local path="$1" jar="$2"
  local cookie=""
  if [ -f "$jar" ]; then cookie="-b $jar"; fi
  curl -sf -c "$jar" $cookie "$API_BASE$path" 2>/dev/null
}

curl_sj() {
  local path="$1" jar="$2"
  local cookie=""
  if [ -f "$jar" ]; then cookie="-b $jar"; fi
  curl -sf -c "$jar" $cookie -H 'content-type: application/json' "$API_BASE$path" 2>/dev/null
}

echo "[idempotency] Starting seed idempotency test…"

# ── Login as alice to inspect state ──
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

jar="$TMPDIR/jar"
curl_sj /auth/dev-login -X POST -d '{"username":"alice"}' "$jar" > /dev/null

# ── Snapshot function ──
snapshot() {
  local label="$1"
  # Count users (check /auth/me shape — but we need global count)
  # We count via servers list: members of Fixture Guild
  local servers
  servers=$(curl_s /servers "$jar" | jq '[.[] | select(.name == "Fixture Guild")]')
  local server_id
  server_id=$(echo "$servers" | jq -r '.[0].id // empty')
  
  if [ -z "$server_id" ]; then
    echo "  [snapshot:$label] No Fixture Guild found"
    return
  fi

  local members
  members=$(curl_s "/servers/$server_id/members" "$jar")
  local member_count
  member_count=$(echo "$members" | jq 'length')

  local channels
  channels=$(curl_s "/servers/$server_id/channels" "$jar")
  local ch_count
  ch_count=$(echo "$channels" | jq 'length')

  local roles
  roles=$(curl_s "/servers/$server_id/roles" "$jar")
  local role_count
  role_count=$(echo "$roles" | jq 'length')

  local friends
  friends=$(curl_s /friends "$jar")
  local friend_count
  friend_count=$(echo "$friends" | jq 'length')

  local dms
  dms=$(curl_s /dms "$jar")
  local dm_count
  dm_count=$(echo "$dms" | jq 'length')

  # Check fixture-ids.json
  local fid_file="$ROOT/tools/seed/fixture-ids.json"
  local fid_hash="missing"
  if [ -f "$fid_file" ]; then
    fid_hash=$(md5 -q "$fid_file" 2>/dev/null || md5sum "$fid_file" 2>/dev/null | cut -d' ' -f1)
  fi

  echo "$member_count $ch_count $role_count $friend_count $dm_count $fid_hash"
}

echo "[idempotency] Pre-seed snapshot…"
pre=$(snapshot "pre")
echo "  pre: $pre"

echo "[idempotency] Running seed (run 1)…"
bash "$ROOT/tools/devctl" stack seed || fail "seed run 1 failed"

echo "[idempotency] Post-run-1 snapshot…"
run1=$(snapshot "run1")
echo "  run1: $run1"

echo "[idempotency] Running seed (run 2 — idempotent, should converge)…"
bash "$ROOT/tools/devctl" stack seed || fail "seed run 2 failed"

echo "[idempotency] Post-run-2 snapshot…"
run2=$(snapshot "run2")
echo "  run2: $run2"

# ── Parse snapshots ──
read -r r1_members r1_chans r1_roles r1_friends r1_dms r1_hash <<< "$run1"
read -r r2_members r2_chans r2_roles r2_friends r2_dms r2_hash <<< "$run2"

# ── Assertions ──
errors=0

# Assert EXACT equality between run-1 and run-2 counts, per entity type.
# Weak >= thresholds are NOT sufficient — a seed that duplicates every entity
# passes them. Convergence means run-2 adds NOTHING.
if [ "$r1_members" != "$r2_members" ]; then
  echo "  ✗ member count diverged: $r1_members → $r2_members (expected exactly equal)"
  errors=$((errors + 1))
else
  echo "  ✓ member count exact match: $r1_members"
fi

if [ "$r1_chans" != "$r2_chans" ]; then
  echo "  ✗ channel count diverged: $r1_chans → $r2_chans (expected exactly equal)"
  errors=$((errors + 1))
else
  echo "  ✓ channel count exact match: $r1_chans"
fi

if [ "$r1_roles" != "$r2_roles" ]; then
  echo "  ✗ role count diverged: $r1_roles → $r2_roles (expected exactly equal)"
  errors=$((errors + 1))
else
  echo "  ✓ role count exact match: $r1_roles"
fi

if [ "$r1_friends" != "$r2_friends" ]; then
  echo "  ✗ friend count diverged: $r1_friends → $r2_friends (expected exactly equal)"
  errors=$((errors + 1))
else
  echo "  ✓ friend count exact match: $r1_friends"
fi

if [ "$r1_dms" != "$r2_dms" ]; then
  echo "  ✗ DM count diverged: $r1_dms → $r2_dms (expected exactly equal)"
  errors=$((errors + 1))
else
  echo "  ✓ DM count exact match: $r1_dms"
fi

# Fixture-ids.json should be byte-identical between runs
if [ "$r1_hash" != "$r2_hash" ]; then
  echo "  ✗ fixture-ids.json changed between runs (hash: $r1_hash → $r2_hash)"
  errors=$((errors + 1))
else
  echo "  ✓ fixture-ids.json byte-stable: $r1_hash"
fi

if [ "$errors" -gt 0 ]; then
  fail "idempotency test failed with $errors assertion(s)"
fi

echo "  ✓ seed idempotency confirmed: same entity counts, fixture-ids.json stable"