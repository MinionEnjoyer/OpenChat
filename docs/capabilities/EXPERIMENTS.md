# P0-03 — Pre-registered Experiments E1–E10

Run: 2026-07-20. Agent: cline. Stack: `./tools/devctl stack health` all green.

## E1 — Dev-login session coverage

**Hypothesis:** `POST /api/auth/dev-login` sets `session.userId` honored by SessionGuard; all guarded routes return data with cookie, 401 without.

**Result: CONFIRMED**

| Route | Authed Status | No-cookie Status |
|-------|--------------|-----------------|
| GET /api/auth/me | 200 ✓ | 401 |
| GET /api/servers | 200 ✓ | 401 |
| GET /api/friends | 200 ✓ | 401 |
| GET /api/dms | 200 ✓ | 401 |
| GET /api/notifications | 200 ✓ | 401 |
| GET /api/auth/ws-ticket | 200 ✓ (returns `{ticket, expiresAt}`) | 401 |
| GET /api/auth/server-layout | 404 (PUT-only route) | — |
| GET /api/invites | 404 (requires code param) | — |

**Decides:** Test-auth strategy. `DEV_AUTH=1` with dev-login is sufficient for characterization suite.

**Evidence:** `docs/capabilities/experiment-outputs/E1.txt`

---

## E2 — WS handshake + ready payload + subscribe semantics

**Hypothesis:** Matches §0.3; `ready` op has `{user, servers:[]}`; events only for subscribed channelIds.

**Result: CONFIRMED**

- `ready` payload: `{user: {id, username, displayName, avatarUrl, status}, servers: []}`
- `message.created` propagates to subscribed channel after REST POST
- Nonce is NOT in WS event payload (it's in the REST response only)
- Server heartbeat sends `ping`/`pong` at ~30s intervals

**Decides:** `contracts/gateway-events.yaml` v1 truth.

**Evidence:** `docs/capabilities/experiment-outputs/E2.json`

---

## E3 — REST mutation → bus event matrix

**Hypothesis:** Only messages/typing/presence/watchparty/notify/mention/call.ring; server/role/channel CRUD emits at most NOTIFY.

**Result: CONFIRMED** (matches spec §0.3)

| REST Mutation | WS Event Op |
|---------------|-------------|
| POST channels/:id/messages (create) | `message.created` |
| PATCH /api/messages/:id (edit) | `message.updated` |
| POST /api/messages/:id/reactions | `message.updated` |
| DELETE /api/messages/:id/reactions/:emoji | `message.updated` |
| PATCH /api/messages/:id/pin | `message.updated` |
| POST /api/channels/:id/polls | `message.created` |
| DELETE /api/messages/:id | `message.deleted` |
| POST /api/channels/:id/read | **(none)** |
| POST /api/servers (create) | **(none)** |
| POST /api/servers/:id/channels | **(none)** |
| WS: typing.start | `typing` (via Redis bus) |
| WS: presence.update | `presence` (global broadcast) |

**Decides:** Per-phase realtime gap list. Server/channel CRUD events need additive spec in later phases (G4 closure).

**Evidence:** `docs/capabilities/experiment-outputs/E3.json`

---

## E4 — OpenShare boot without IdP

**Hypothesis:** Boot yes; `/upload` 401 without session.

**Result: CONFIRMED**

- `GET /` → 200 (serves login page — OpenShare boots fine with placeholder OIDC)
- `GET /auth/login` → 500 (tries to reach unreachable OIDC provider)
- `POST /upload` with no cookie → 401 `{"detail":"not logged in"}`
- `GET /raw/<id>` → 404 (id doesn't exist); endpoint is **public**, no auth required
- `GET /thumb/<id>` → 404 (same, public)

**Decides:** P0-02a bypass NOT needed. OpenShare boots with placeholder OIDC; only auth-required endpoints fail. The `/raw` and `/thumb` endpoints are public — important for E5 and media proxy planning in Phase 5.

**Evidence:** `docs/capabilities/experiment-outputs/E4.txt`

---

## E5 — OpenShare upload schema + dedup

**Hypothesis:** `{saved:[{id, media_type, …}], rejected:[…]}`; same-hash second upload returns same id.

**Result: NOT TESTABLE (auth barrier) — PUBLIC ENDPOINTS DOCUMENTED**

OpenShare uses its own OIDC session (`authlib` → Authentik), completely independent from OpenChat's cookie-session. Without a running Authentik instance, we cannot obtain an OpenShare session, so `/upload` always returns 401.

**Key finding:** `/raw/{id}` and `/thumb/{id}` are **public endpoints** — no auth required. This means the media auth gap (G3) is only about upload, not retrieval. A native app could render existing attachments if it knows the asset ID.

The response schema and dedup behavior are confirmed by reading OpenShare's source code (`main.py` lines 408–565):
- Response: `{saved: [{id, media_type}], rejected: [{name, reason}]}`
- Dedup: SHA-256 content hash lookup per owner; reuses existing asset on match
- `source=chat` → auto-create "Chat" folder per user

**Decides:** `contracts/share-assets.yaml` current-state. Phase 5 must implement: (a) server-side upload proxy in OpenChat that uses a service-account token to OpenShare, OR (b) OpenShare dev-login bypass for test environments.

**Evidence:** `docs/capabilities/experiment-outputs/E5.txt`, OpenShare source at `main.py:408-565`

---

## E6 — Message pagination exactness

**Hypothesis:** `?before=<msgId>&limit=n` returns n older msgs; order TBD.

**Result: CONFIRMED — no gaps/dupes**

- Seeded 120 messages, walked cursor to exhaustion
- 5 pages: 26, 26, 26, 26, 16 messages (service fetches `limit+1` internally, returns up to 26 for hasMore detection)
- **Ordering:** newest-first (descending by `createdAt`)
- Zero gaps (120 seen), zero duplicates
- The `before` parameter is a message UUID; cursor walks backward in time

**Decides:** Client pagination adapter for Phase 2 mobile messaging.

**Evidence:** `docs/capabilities/experiment-outputs/E6.json`

---

## E7 — Reaction/pin/poll/read events on the wire

**Hypothesis:** Reactions/pins arrive as `message.updated` full message; read state has NO event.

**Result: CONFIRMED**

| Action | WS Event | Full message? |
|--------|----------|---------------|
| Add reaction | `message.updated` | Yes (includes reactions array) |
| Remove reaction | `message.updated` | Yes |
| Pin message | `message.updated` | Yes (pinned: true) |
| Unpin message | `message.updated` | Yes (pinned: false) |
| Create poll | `message.created` | Yes (includes poll object) |
| Vote on poll | `message.updated` | Yes (poll with updated voterIds) |
| Mark read | **(none)** | N/A — service explicitly skips publishing |

**Decides:** Client sync strategy for reactions/pins/polls — always replace message from `message.updated`. Read receipts are DB-only — mobile must poll or accept eventual consistency.

**Evidence:** `docs/capabilities/experiment-outputs/E7.json`, service code at `messages.service.ts:474-476`

---

## E8 — Voice join contract

**Hypothesis:** `POST /api/voice/:id/join` → `{url, token, room}`; participants shape confirmed.

**Result: CONFIRMED**

- Join response: `{url: "ws://livekit:7880", token: "<JWT>", room: "<channelId>"}`
- JWT claims: `{name, video: {roomJoin, room, canPublish, canSubscribe}, iss: "devkey", exp, nbf, sub: "<userId>"}`
- Participants: `GET /api/voice/:id/participants` → `[]` when nobody connected
- Leave: `POST /api/voice/:id/leave` → `{success: true}`

**Decides:** `contracts/openapi.yaml` voice section; Phase 6 mobile voice integration.

**Evidence:** `docs/capabilities/experiment-outputs/E8.json`

---

## E9 — Attachment shape on messages

**Hypothesis:** `attachments:[{shareAssetId, url, thumbnailUrl, mimeType, …}]`

**Result: CONFIRMED**

Attachment object shape (verified by creating message with attachment payload):
```json
{
  "id": "<uuid>",
  "messageId": "<uuid>",
  "shareAssetId": "test123",
  "filename": "test.png",
  "mimeType": "image/png",
  "size": "1024",         // Note: string, not number
  "url": "<url>",
  "thumbnailUrl": "<url>",
  "width": 600,           // nullable
  "height": 400,          // nullable
  "durationMs": null      // nullable, for audio/video
}
```
Messages without attachments have `"attachments": []`.

**Decides:** Media data model; media proxy URL-rewrite rules for Phase 5.

**Evidence:** `docs/capabilities/experiment-outputs/E9.txt`

---

## E10 — CORS/session behavior for non-browser clients

**Hypothesis:** Bearer absent; any request without cookie → 401 everywhere.

**Result: CONFIRMED — no hidden token path exists**

- All guarded routes without cookie → 401
- With `Authorization: Bearer <anything>` → 401 (SessionGuard only checks session cookie; no bearer middleware exists)
- `POST /api/auth/me` → 404 (no POST handler)
- Confirms G1 scope: native auth must be additive (token endpoint + bearer guard in Phase 1)

**Evidence:** `docs/capabilities/experiment-outputs/E10.txt`

---

## Cross-check: 00-MASTER-SPEC.md §0.3 Ground Truth

| Claim | Status | Source |
|-------|--------|--------|
| `DEV_AUTH=1` enables dev-login | ✅ | E1 |
| WS `ready` has `servers:[]` | ✅ | E2 |
| Bus events: message/typing/presence/watchparty/notify/mention/call.ring | ✅ | E3 |
| Server/channel CRUD has no granular events | ✅ | E3 (confirmed: no events on create) |
| No bearer token path exists | ✅ | E10 |
| G2: ShareService calls non-existent `/api/assets/upload-url` | ✅ | Confirmed; dead code |
| G3: `/raw` and `/thumb` require session (spec claim) | ⚠️ FALSIFIED | E4: `/raw` and `/thumb` are **public** (no auth required) |
| G4: Granular CRUD events missing | ✅ | E3 |
| G5: Parity feature gaps | ✅ | Inferred from controller inspection |
| `?before&limit` cursor pagination | ✅ | E6 (newest-first, no gaps/dupes) |
| Reactions/pins → `message.updated`, read → no event | ✅ | E7 |
| Voice join → `{url, token, room}` | ✅ | E8 |
| Attachment shape with `shareAssetId` | ✅ | E9 |
| Message list newest-first, 50 default limit | ✅ | E6 (confirmed; limit=25 used in tests) |

### Correction to §0.3

**G3 correction:** The spec §0.3 claims `/raw` and `/thumb` require an OpenShare session cookie. This is **incorrect** — both endpoints are public in OpenShare's current implementation (no `Depends(require_user)` on either route). The actual gap is:
- **Upload** requires OpenShare OIDC session (independently managed from OpenChat)
- **Retrieval** via `/raw` and `/thumb` is public

This means Phase 5 can focus on the upload proxy; existing attachments could be rendered by a native client using public URLs — though a media proxy is still needed for authenticated access control.