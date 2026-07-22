#!/usr/bin/env bash
# P0-03 — Experiments E1, E4, E5, E9, E10 (HTTP-only)
# All output captured to docs/capabilities/experiment-outputs/
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="$SCRIPT_DIR/../../docs/capabilities/experiment-outputs"
mkdir -p "$OUT_DIR"

BASE="http://localhost:3001"
SHARE="http://localhost:8800"
JAR1="/tmp/e_cookiejar_alice.txt"
JAR2="/tmp/e_cookiejar_bob.txt"

# Clean cookie jars and create test PNG
rm -f "$JAR1" "$JAR2"
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82' > /tmp/1px.png

log() { echo "$@" | tee -a "$OUT_DIR/$1.txt"; }

# ═══════ E1: dev-login session coverage ═══════
echo "=== E1 ==="
log "E1" "--- POST /api/auth/dev-login (alice) ---"
curl -s -c "$JAR1" -X POST "$BASE/api/auth/dev-login" \
  -d '{"username":"alice"}' -H 'content-type: application/json' >> "$OUT_DIR/E1.txt" 2>&1
echo "" >> "$OUT_DIR/E1.txt"

for ROUTE in \
  "/api/auth/me" \
  "/api/servers" \
  "/api/friends" \
  "/api/dms" \
  "/api/notifications" \
  "/api/auth/ws-ticket" \
  "/api/auth/server-layout" \
  "/api/invites"; do
  log "E1" "--- GET $ROUTE (authed) ---"
  curl -s -w "\nHTTP_STATUS: %{http_code}\n" -b "$JAR1" "$BASE$ROUTE" >> "$OUT_DIR/E1.txt" 2>&1
  echo "" >> "$OUT_DIR/E1.txt"
done

log "E1" "--- GET /api/auth/me (no cookie) ---"
curl -s -w "\nHTTP_STATUS: %{http_code}\n" "$BASE/api/auth/me" >> "$OUT_DIR/E1.txt" 2>&1
echo "" >> "$OUT_DIR/E1.txt"

log "E1" "E1 DONE"

# ═══════ E4: OpenShare boot + upload without session ═══════
echo "=== E4 ==="
log "E4" "--- GET / (OpenShare root) ---"
curl -s -w "\nHTTP_STATUS: %{http_code}\n" "$SHARE/" >> "$OUT_DIR/E4.txt" 2>&1
echo "" >> "$OUT_DIR/E4.txt"

log "E4" "--- GET /auth/login (OpenShare OIDC redirect) ---"
curl -s -w "\nHTTP_STATUS: %{http_code}\n" -L "$SHARE/auth/login" >> "$OUT_DIR/E4.txt" 2>&1
echo "" >> "$OUT_DIR/E4.txt"

log "E4" "--- POST /upload (no cookie) ---"
curl -s -w "\nHTTP_STATUS: %{http_code}\n" -X POST "$SHARE/upload" -F "file=@/tmp/1px.png" -F "source=chat" >> "$OUT_DIR/E4.txt" 2>&1
echo "" >> "$OUT_DIR/E4.txt"

log "E4" "--- GET /raw/<any> (no cookie) ---"
curl -s -w "\nHTTP_STATUS: %{http_code}\n" "$SHARE/raw/doesnotexist" >> "$OUT_DIR/E4.txt" 2>&1
echo "" >> "$OUT_DIR/E4.txt"

log "E4" "E4 DONE"

# ═══════ E10: CORS / non-browser behavior ═══════
echo "=== E10 ==="
for ROUTE in "/api/auth/me" "/api/servers" "/api/dms" "/api/friends" "/api/auth/ws-ticket" "/api/invites"; do
  log "E10" "--- GET $ROUTE (no cookie) ---"
  curl -s -w "\nHTTP_STATUS: %{http_code}\n" "$BASE$ROUTE" >> "$OUT_DIR/E10.txt" 2>&1
  echo "" >> "$OUT_DIR/E10.txt"
done

log "E10" "--- GET /api/auth/me (Bearer faketoken) ---"
curl -s -w "\nHTTP_STATUS: %{http_code}\n" -H "Authorization: Bearer faketoken123" "$BASE/api/auth/me" >> "$OUT_DIR/E10.txt" 2>&1
echo "" >> "$OUT_DIR/E10.txt"

log "E10" "--- POST /api/auth/me (Bearer) ---"
curl -s -w "\nHTTP_STATUS: %{http_code}\n" -X POST -H "Authorization: Bearer faketoken" "$BASE/api/auth/me" >> "$OUT_DIR/E10.txt" 2>&1
echo "" >> "$OUT_DIR/E10.txt"

log "E10" "E10 DONE"

# ═══════ E9: Attachment shape on messages ═══════
echo "=== E9 ==="

# Create a server for alice
log "E9" "--- POST /api/servers (create) ---"
SERVER=$(curl -s -b "$JAR1" -X POST "$BASE/api/servers" \
  -H 'content-type: application/json' \
  -d '{"name":"E9 Test Server"}' 2>&1)
echo "$SERVER" >> "$OUT_DIR/E9.txt"
echo "" >> "$OUT_DIR/E9.txt"
SERVER_ID=$(echo "$SERVER" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
log "E9" "Server ID: $SERVER_ID"

# Get the default channel
log "E9" "--- GET /api/servers/$SERVER_ID/channels ---"
CHANNELS=$(curl -s -b "$JAR1" "$BASE/api/servers/$SERVER_ID/channels" 2>&1)
echo "$CHANNELS" >> "$OUT_DIR/E9.txt"
echo "" >> "$OUT_DIR/E9.txt"
CHANNEL_ID=$(echo "$CHANNELS" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
log "E9" "Channel ID: $CHANNEL_ID"

# Post a message (correct route: POST /api/channels/:id/messages)
log "E9" "--- POST /api/channels/$CHANNEL_ID/messages (send msg) ---"
MSG=$(curl -s -b "$JAR1" -X POST "$BASE/api/channels/$CHANNEL_ID/messages" \
  -H 'content-type: application/json' \
  -d "{\"content\":\"Hello E9\",\"nonce\":\"$(uuidgen || echo 'test-1')\"}" 2>&1)
echo "$MSG" >> "$OUT_DIR/E9.txt"
echo "" >> "$OUT_DIR/E9.txt"
MSG_ID=$(echo "$MSG" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
log "E9" "Message ID: $MSG_ID"

# Read message back to see attachment shape
log "E9" "--- GET /api/channels/$CHANNEL_ID/messages ---"
curl -s -b "$JAR1" "$BASE/api/channels/$CHANNEL_ID/messages" >> "$OUT_DIR/E9.txt" 2>&1
echo "" >> "$OUT_DIR/E9.txt"

# Post a message with attachment schema (even without actual upload)
log "E9" "--- POST /api/channels/$CHANNEL_ID/messages (with attachments) ---"
curl -s -b "$JAR1" -X POST "$BASE/api/channels/$CHANNEL_ID/messages" \
  -H 'content-type: application/json' \
  -d "{\"content\":\"With attachment\",\"attachments\":[{\"shareAssetId\":\"test123\",\"filename\":\"test.png\",\"mimeType\":\"image/png\",\"size\":1024,\"url\":\"https://placehold.co/600x400\",\"thumbnailUrl\":\"https://placehold.co/150x150\",\"width\":600,\"height\":400}]}" >> "$OUT_DIR/E9.txt" 2>&1
echo "" >> "$OUT_DIR/E9.txt"

# Read back to see attachment fields in message
log "E9" "--- GET /api/channels/$CHANNEL_ID/messages (after attachment msg) ---"
curl -s -b "$JAR1" "$BASE/api/channels/$CHANNEL_ID/messages" >> "$OUT_DIR/E9.txt" 2>&1
echo "" >> "$OUT_DIR/E9.txt"

log "E9" "E9 DONE"

# ═══════ E5: OpenShare upload with session + dedup ═══════
echo "=== E5 ==="
# OpenShare uses its own OIDC session, independent from OpenChat.
# We need to test what happens when we have NO session (already covered by E4).
# Document the observation: OpenShare /auth/login requires a reachable IdP.
# The /raw and /thumb endpoints are public (no auth required).

log "E5" "--- OpenShare /auth/login (follow redirects) ---"
curl -s -w "\nHTTP_STATUS: %{http_code}\n" -L --max-redirs 5 "$SHARE/auth/login" 2>&1 >> "$OUT_DIR/E5.txt" || true
echo "" >> "$OUT_DIR/E5.txt"

log "E5" "--- OpenShare /raw/<id> (public, no auth needed) ---"
curl -s -w "\nHTTP_STATUS: %{http_code}\n" "$SHARE/raw/doesnotexist" >> "$OUT_DIR/E5.txt" 2>&1
echo "" >> "$OUT_DIR/E5.txt"

log "E5" "--- OpenShare /thumb/<id> (public, no auth needed) ---"
curl -s -w "\nHTTP_STATUS: %{http_code}\n" "$SHARE/thumb/doesnotexist" >> "$OUT_DIR/E5.txt" 2>&1
echo "" >> "$OUT_DIR/E5.txt"

log "E5" "E5 DONE"

echo ""
echo "=== All HTTP experiments complete ==="
echo "Results written to: $OUT_DIR/E{1,4,5,9,10}.txt"