# Upstream Adoption Guide

**Date:** 2026-07-26
**Audience:** Maintainers of MinionEnjoyer/OpenChat and owners of the web and desktop clients.
**Purpose:** "What do I gain, and how do I wire it into my client?"

This document covers every new feature in our fork that is candidate for upstream
adoption. Each section answers: what the user gets, what the API looks like
(derived from the actual controllers), what schema changes are required, what
client work is needed, and what dependencies exist.

Companion documents:
- [UPSTREAM-DIVERGENCE.md](./UPSTREAM-DIVERGENCE.md) — route inventory, collision analysis, safety argument.
- [UPSTREAM-PROPOSAL.md](./UPSTREAM-PROPOSAL.md) — deep-dive into the three highest-value improvements.

---

## Feature adoption costs at a glance

| # | Feature | Migration | External dependency | Client effort |
|---|---------|-----------|---------------------|---------------|
| 1 | Native auth (PKCE) | No | OIDC provider | Low |
| 2 | Push notifications | **Yes** | FCM + OIDC provider | Medium |
| 3 | Channel categories & reordering | No¹ | None | Low–Medium |
| 4 | Permission overwrites | **Yes** | None | High |
| 5 | Bans | **Yes** | None | Medium |
| 6 | Timeouts | **Yes²** | None | Medium |
| 7 | Audit log (read endpoint) | No³ | None | Medium |
| 8 | Friend blocking | No | None | Low |
| 9 | Media proxy (raw + thumb) | No | OpenShare | None⁴ |
| 10 | Channel message search | No | None | Low |
| 11 | Granular WS guild events | No | None | Low |

¹ Category model already shared; guide flags one field to verify.
² `timedOutUntil` column on `ServerMember` — verify whether upstream has it; if not, ALTER TABLE.
³ `AuditLog` model is already shared; only the read route and controller are new.
⁴ Already works in the browser — auth proxying makes media links reliable.

---

## 1. Native auth: PKCE token exchange + OIDC discovery

### What the user gets
Native desktop and mobile clients can log in directly without a browser
redirect dance. They use the system browser once for the OAuth flow, receive a
bearer token, and refresh it silently thereafter. The existing cookie-based web
login is completely untouched.

### Endpoints

**`POST /auth/token`** — issue bearer tokens (no prior session required)

Request body:
```json
{
  "grantType": "authorization_code",
  "code": "abc123...",
  "codeVerifier": "s256-challenge-verifier",
  "redirectUri": "openchat://auth"
}
```
Response `200`:
```json
{
  "accessToken": "eyJ...",
  "expiresIn": 3600,
  "refreshToken": "rt_v1_...",
  "user": {
    "id": "a1b2c3d4-...",
    "username": "alice",
    "displayName": "Alice",
    "avatarUrl": "https://share.example.com/avatars/alice.png",
    "status": "ONLINE",
    "friendCode": "12345678"
  }
}
```
Error `400`: missing required fields, bad `grantType`.
Error `401`: invalid code, wrong redirect URI.

Refresh grant:
```json
{
  "grantType": "refresh_token",
  "refreshToken": "rt_v1_..."
}
```
Response shape identical. Refresh tokens rotate on every use; presenting a
previously-spent refresh token revokes the entire family (theft detection).

**`GET /auth/oidc-metadata`** — public discovery (no auth required)

Response `200`:
```json
{
  "issuer": "https://auth.example.com/application/o/openchat/",
  "clientId": "abcd1234...",
  "nativeRedirectUri": "openchat://auth",
  "scopes": ["openid", "profile", "email"]
}
```

### Schema
No new database models. Token state lives entirely in Redis:
- `rt:<sha256>` → `{userId, familyId}` — unspent refresh token
- `rtused:<sha256>` → `familyId` — spent token (reuse detection)
- `rtfam:<id>` → `"1"` — family liveness

### Client work required
Desktop client: exchange the OIDC authorization code for tokens via
`POST /auth/token`, store the refresh token securely, and attach
`Authorization: Bearer <accessToken>` to all API requests. Refresh
transparently on 401.

Web client: nothing required — cookie sessions continue to work as before.

### Dependencies
- An OIDC provider (e.g. Authentik) registered with a `NATIVE_REDIRECT_URI`.
- A `NATIVE_REDIRECT_URI` env var on the server (defaults to `openchat://auth`).
- Redis (already required by OpenChat).

### Optional or core
Core for any native client. Entirely optional for web-only deployments — the
cookie session path is unchanged. The upstream `POST /auth/tokens` (named API
token CRUD) serves a related but different purpose (manual token creation for
bots/scripts). These two subsystems can coexist; they don't conflict at the
route level (`/auth/token` vs `/auth/tokens`).

**⚠️ Merge question for upstream:** Upstream has its own native auth system
with `ApiToken` model + `POST/GET/DELETE /auth/tokens`. Our PKCE system is
designed for user-facing login flows (interactive, refresh-token rotation,
family revocation); upstream's is designed for static API tokens (manual
revocation, no rotation). Do you want both, or should one absorb the other?
The route paths don't collide, so coexistence is mechanically trivial.

---

## 2. Push notifications

### What the user gets
Users on Android (and potentially iOS) receive push notifications for
@mentions, direct messages, and incoming calls — even when the app is in the
background. Per-server and per-channel notification settings let users mute
noisy servers or suppress everything except mentions.

### Endpoints

**Device registry:**

`POST /devices` — register a push token (idempotent; transfers ownership if a different user registers the same token — device changed hands)
Request body:
```json
{
  "token": "fcm-token-string-from-firebase-sdk",
  "platform": "android"
}
```
Response `201`:
```json
{
  "id": "d1e2f3...",
  "userId": "a1b2c3d4-...",
  "token": "fcm-token-string-from-firebase-sdk",
  "platform": "android",
  "lastSeen": "2026-07-26T12:00:00.000Z"
}
```

`GET /devices` — list the current user's registered tokens
Response `200` (array of DeviceToken objects, same shape as above, ordered by `lastSeen` desc).

`DELETE /devices/:token` — remove a token (idempotent — deleting an unknown token returns `204`).

**Notification settings:**

`GET /notifications/settings` — list all settings for the current user
Response `200`:
```json
[
  {
    "id": "s1e2t3...",
    "userId": "a1b2c3d4-...",
    "scope": "SERVER",
    "scopeId": "server-uuid-here",
    "level": "MENTIONS",
    "mutedUntil": null
  }
]
```

`PUT /notifications/settings` — create or update a setting
Request body:
```json
{
  "scope": "CHANNEL",
  "scopeId": "channel-uuid-here",
  "level": "NONE",
  "mutedUntil": null
}
```
You can also pass `"mutedUntil": "2026-07-27T12:00:00.000Z"` for temporary
mutes. Scope is `SERVER` or `CHANNEL`. Level is `ALL`, `MENTIONS`, or `NONE`.

Response `200`:
```json
{
  "id": "s4e5t6...",
  "userId": "a1b2c3d4-...",
  "scope": "CHANNEL",
  "scopeId": "channel-uuid-here",
  "level": "NONE",
  "mutedUntil": null
}
```

`DELETE /notifications/settings/:id` — delete a setting by its ID. Returns `404` if not found.

**Dispatch:** A background worker subscribes to Redis `chat:events`, resolves
notification settings, and dispatches via the configured push transport (FCM
HTTP v1 for Android). Dispatch is automatic — no REST endpoints to call.

Settings resolution (most specific wins):
1. CHANNEL-level setting
2. SERVER-level setting
3. Default: ALL (push for everything)

Events dispatched: `MENTION`, `NOTIFY` (new DM message), `CALL_RING`.

### Schema — ⚠️ MIGRATION REQUIRED

Two new models:

**`DeviceToken`**
```prisma
model DeviceToken {
  id       String   @id @default(uuid())
  userId   String
  token    String
  platform String    // "android" | "ios"
  lastSeen DateTime @default(now())
  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([userId, token])
  @@index([userId])
}
```

**`NotificationSetting`**
```prisma
model NotificationSetting {
  id         String            @id @default(uuid())
  userId     String
  mutedUntil DateTime?
  scope      NotificationScope // SERVER | CHANNEL
  scopeId    String
  level      NotificationLevel @default(ALL) // ALL | MENTIONS | NONE
  user       User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([userId, scope, scopeId])
}
```

Plus two enums: `NotificationScope` (`SERVER`, `CHANNEL`) and
`NotificationLevel` (`ALL`, `MENTIONS`, `NONE`).

### Client work required
**Desktop/web:** If you want push notifications in the browser/desktop, you
need to register the browser's push subscription token via `POST /devices` and
provide notification-settings UI. This is medium effort — settings UI plus
service-worker integration.

**Mobile:** Full integration — token registration at startup, settings UI, and
background-message handling. Our Android client already does all of this and
can serve as reference.

### Dependencies
- **FCM (Firebase Cloud Messaging):** `FCM_SERVICE_ACCOUNT` env var containing
  a JSON service-account key. Absent credentials → no-op (null-object pattern;
  the server starts fine, pushes just silently don't go out). FCM is currently
  the only transport implemented; iOS APNs would need an additional transport
  implementation.
- **Redis:** Already required by OpenChat. The dispatch worker subscribes to
  `chat:events` on an additional subscriber.

### Optional or core
Optional. Push notifications add real user value but require the most
infrastructure setup (FCM project, service account, client SDK integration).
A deployment can adopt the device registry and notification settings without
enabling FCM — endpoints work fine, dispatch just won't fire.

---

## 3. Channel categories and reordering

### What the user gets
Channels can be grouped into named categories (folders) and reordered via
drag-and-drop. Without this, all channels appear in a flat list in creation
order — workable for small servers, chaotic for large ones.

### Endpoints

**`GET /servers/:id/categories`** — list categories for a server
Response `200`:
```json
[
  {
    "id": "cat-uuid-1",
    "serverId": "server-uuid",
    "name": "Text Channels",
    "position": 0,
    "channels": [
      { "id": "ch-uuid-1", "name": "general", "type": "TEXT", "position": 0, "topic": null }
    ]
  }
]
```

**`PATCH /servers/:id/channels/reorder`** — reorder channels in bulk
Request body:
```json
{ "orderedIds": ["ch-uuid-3", "ch-uuid-1", "ch-uuid-2"] }
```
Positions are assigned 0, 1, 2 based on array order. Response is the updated
channel list.

**`PATCH /servers/:id/channels/:channelId`** — update channel properties
Request body:
```json
{
  "name": "announcements-v2",
  "topic": "Server-wide announcements only",
  "categoryId": "cat-uuid-2"
}
```
All fields optional. Set `categoryId` to `null` to remove a channel from its
category. Response is the updated channel object.

### Schema
No new models. The `Category` model and `categoryId` + `position` fields on
`Channel` already exist in the upstream shared schema (verified by the
divergence report's model→field-set diff).

### Client work required
**Web/desktop:** Server sidebar needs category grouping (collapsible sections)
and drag-to-reorder support. The existing web client already has a flat channel
list; adding category headers and drag handles is low-to-medium effort — the
data shape is straightforward.

### Dependencies
None.

### Optional or core
Optional but high-impact for servers with more than ~10 channels. The endpoints
are harmless if ignored — existing flat channel lists continue to work.

---

## 4. Permission overwrites

### What the user gets
Server admins can override permissions for a specific channel — e.g. "Moderators
can send messages in #announcements but @everyone cannot" or "Mute a specific
user in #general." This is the most-requested permission feature in
Discord-like platforms.

### Endpoints

**`GET /servers/:id/channels/:channelId/overwrites`** — list all overwrites
Response `200`:
```json
[
  {
    "id": "ow-uuid-1",
    "channelId": "ch-uuid",
    "targetType": "ROLE",
    "targetId": "role-uuid",
    "allow": "2048",
    "deny": "0"
  },
  {
    "id": "ow-uuid-2",
    "channelId": "ch-uuid",
    "targetType": "MEMBER",
    "targetId": "user-uuid",
    "allow": "0",
    "deny": "2048"
  }
]
```
`allow` and `deny` are decimal-string bitfields matching the existing
`permissions` field on Role.

**`PUT /servers/:id/channels/:channelId/overwrites/:targetType/:targetId`** — upsert
Request body:
```json
{ "allow": "2048", "deny": "0" }
```
`targetType` must be `ROLE` or `MEMBER` (validated server-side; non-matching
throws). `targetId` is the role or user UUID. Both `allow` and `deny` are
optional — omitted fields leave the existing value unchanged. This is an
upsert: if an overwrite for that target already exists, it's updated; otherwise
created.

Response `200` (same shape as individual entry above).
Error `403`: caller lacks `MANAGE_ROLES` or `MANAGE_CHANNELS` permission.
Error `404`: target role/member not found in this server.

**`DELETE /servers/:id/channels/:channelId/overwrites/:overwriteId`** — remove
Response `200`: `{ "success": true }`

**`GET /servers/:id/channels/:channelId/permissions/me`** — effective permissions for current user
Response `200`:
```json
{ "permissions": "1234567890" }
```
This computes the user's effective permission bitfield after applying role
union, `ADMINISTRATOR` grant-all, and overwrite precedence. The logic follows
Discord's documented order:
1. Server owner → all permissions
2. `ADMINISTRATOR` → all permissions
3. Role union → base perms
4. `@everyone` overwrite applied
5. Role overwrites applied (cumulative: allow union, deny union)
6. Member overwrite applied last

### Schema — ⚠️ MIGRATION REQUIRED

**`ChannelOverwrite`**
```prisma
model ChannelOverwrite {
  id         String              @id @default(uuid())
  channelId  String
  targetType OverwriteTargetType  // ROLE | MEMBER
  targetId   String               // role ID or user ID
  allow      BigInt              @default(0)
  deny       BigInt              @default(0)
  channel    Channel             @relation(fields: [channelId], references: [id], onDelete: Cascade)
  @@unique([channelId, targetType, targetId])
  @@index([channelId])
}
```

Plus the `OverwriteTargetType` enum (`ROLE`, `MEMBER`).

### Client work required
**High effort.** This needs:
- A permission-overwrite editor in the channel settings panel (add/remove
  role and member overwrites, toggle individual permission bits for each).
- The existing permission resolver must incorporate overwrites into message-send
  and other channel-action gates. If the web client does client-side permission
  checks, those must also account for overwrites.

This is the most UI-intensive feature in this guide. The backend is clean and
well-tested; the frontend work is the long pole.

### Dependencies
None. The permission resolver is a standalone pure function in
`apps/api/src/permissions/permissions.ts`.

### Optional or core
Optional. Without adopters, overwrites don't exist and permissions behave as
before (role union only). The endpoints are harmless if no client calls them.

**⚠️ Design question for upstream:** Our `allow`/`deny` fields use `BigInt`
(decimal string over the wire) to match upstream's existing role permission
bitfield pattern. If upstream ever wants to move away from this format, the
overwrite model should follow.

---

## 5. Bans

### What the user gets
Server moderators can ban users, optionally deleting recent messages. Bans are
persistent (stored in the database, not just a kick). Banned users cannot
rejoin while the ban exists.

### Endpoints

**`GET /servers/:id/bans`** — list banned members
Response `200`:
```json
[
  {
    "id": "ban-uuid",
    "serverId": "server-uuid",
    "userId": "banned-user-uuid",
    "reason": "Spamming in #general",
    "deleteMessageDays": 1,
    "createdById": "moderator-uuid",
    "createdAt": "2026-07-26T10:00:00.000Z",
    "user": {
      "id": "banned-user-uuid",
      "username": "spammer42",
      "displayName": "Spammer",
      "avatarUrl": null
    }
  }
]
```

**`PUT /servers/:id/bans/:userId`** — ban a member
Request body:
```json
{
  "reason": "Repeated NSFW in voice chat",
  "deleteMessageDays": 1
}
```
`reason` is optional, max 512 chars. `deleteMessageDays` is 0–7, optional
(how many days of the user's messages to purge). Response returns the created
Ban object.
Error `403`: caller lacks `BAN_MEMBERS` permission.

**`DELETE /servers/:id/bans/:userId`** — unban
Response: the deleted Ban confirmation. Error `404` if no active ban.

### Schema — ⚠️ MIGRATION REQUIRED

**`Ban`**
```prisma
model Ban {
  id                String   @id @default(uuid())
  serverId          String
  userId            String
  reason            String?
  createdById       String
  deleteMessageDays Int?
  createdAt         DateTime @default(now())
  server            Server   @relation("BanServer", fields: [serverId], references: [id], onDelete: Cascade)
  user              User     @relation("BanTarget", fields: [userId], references: [id], onDelete: Cascade)
  createdBy         User     @relation("BanIssuer", fields: [createdById], references: [id], onDelete: Cascade)
  @@unique([serverId, userId])
  @@index([serverId])
}
```

### Client work required
**Medium effort.** Server settings panel needs a ban list (table with unban
button) and a "ban user" action on member context menus. Message-purge UI
(days selector) is nice-to-have. Permission gate: users need `BAN_MEMBERS` to
access these endpoints.

### Dependencies
None.

### Optional or core
Standalone. Adopt bans without overwrites or timeouts.

---

## 6. Timeouts

### What the user gets
Moderators can temporarily mute a member — the user remains in the server but
cannot send messages until the timeout expires. Lighter than a kick, heavier
than a warning.

### Endpoints

**`PUT /servers/:id/members/:userId/timeout`** — set a timeout
Request body:
```json
{ "until": "2026-07-26T14:00:00.000Z" }
```
ISO 8601 datetime string. Response returns the updated member object including
`timedOutUntil`.

**`DELETE /servers/:id/members/:userId/timeout`** — clear timeout early
Response: updated member object with `timedOutUntil: null`.

### Schema — ⚠️ MIGRATION REQUIRED

The `timedOutUntil` field on `ServerMember`:
```prisma
model ServerMember {
  // ... existing fields
  timedOutUntil DateTime?
}
```

**⚠️ Verify against upstream schema.** The divergence report confirms no
fields were *removed* from shared models, but does not explicitly enumerate
fields *added* by our fork to shared models. If upstream does not have
`timedOutUntil` on `ServerMember`, this requires an `ALTER TABLE` migration.

### Client work required
**Medium effort.** Member context menu needs "Timeout" action with duration
picker (1 min, 5 min, 1 hour, 1 day, custom). Timed-out users need a visual
indicator in the member list. The message-send gate already checks timeout
status server-side and returns `403`; the client should show a "You are timed
out" state to the affected user.

### Dependencies
None. Independent of bans.

### Optional or core
Optional. Bans and timeouts can be adopted separately.

---

## 7. Audit log

### What the user gets
Server admins can view a chronological log of moderation actions: who kicked
whom, who created/deleted channels, who changed roles, etc. Critical for
multi-moderator servers.

### Endpoints

**`GET /servers/:id/audit-log`** — paginated audit entries
Query parameters:
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `before` | UUID | — | Cursor: return entries older than this entry |
| `limit` | int | 50 | Max 100 |
| `action` | string | — | Filter by action type (e.g. `KICK`, `ROLE_CREATE`) |
| `actorId` | UUID | — | Filter by the user who performed the action |

Response `200`:
```json
{
  "entries": [
    {
      "id": "audit-uuid",
      "serverId": "server-uuid",
      "actor": {
        "id": "mod-uuid",
        "username": "mod_alice",
        "displayName": "Alice",
        "avatarUrl": null
      },
      "action": "KICK",
      "targetType": "USER",
      "targetId": "kicked-user-uuid",
      "metadata": { "reason": "Spam" },
      "createdAt": "2026-07-26T11:00:00.000Z"
    }
  ]
}
```
Error `403`: caller is not a server member or lacks `MANAGE_SERVER` permission.
The server owner always has access.

**Log writes happen automatically** in existing server actions (kick, role
CRUD, channel CRUD, server update, member join/leave, message delete/pin).
You don't call a "write audit" endpoint — the services do it internally.

Actions recorded: `KICK`, `ROLE_CREATE`, `ROLE_UPDATE`, `ROLE_DELETE`,
`ROLE_ASSIGN`, `ROLE_UNASSIGN`, `CHANNEL_CREATE`, `CHANNEL_DELETE`,
`SERVER_UPDATE`, `MEMBER_JOIN`, `MEMBER_LEAVE`, `MESSAGE_DELETE`,
`MESSAGE_PIN`, `MESSAGE_UNPIN`.

### Schema
The `AuditLog` model exists in both upstream and our fork (verified by the
divergence report's model inventory — 21 shared models). No migration required.
What's new is the **controller** and **service** that read from it.

If upstream has the model but no read endpoint, the DB table is already there —
this feature adds the read path and the automatic write calls in services.

### Client work required
**Medium effort.** Server settings needs an audit-log page with a
reverse-chronological list, action-type filter dropdown, and actor filter.
Pagination via `before` cursor is straightforward. Permission gate: only users
with `MANAGE_SERVER` can view it.

### Dependencies
None.

### Optional or core
Optional. The audit log is purely a tooling/transparency feature; it doesn't
change how any other feature works.

---

## 8. Friend blocking

### What the user gets
Users can block another user, preventing them from sending friend requests or
DMs. Blocked users can be unblocked later. The blocked-user list is visible in
settings.

### Endpoints

**`GET /friends/blocked`** — list blocked users
Response `200`:
```json
[
  {
    "id": "blocked-user-uuid",
    "username": "spammer42",
    "displayName": "Spammer",
    "avatarUrl": null,
    "status": "OFFLINE"
  }
]
```

**`POST /friends/block/:userId`** — block a user (upserts the Friendship row to
status `BLOCKED`; if a friendship already existed, it becomes a block
regardless of prior state)

**`POST /friends/unblock/:userId`** — unblock (deletes the row). Returns `404`
if no block exists.

### Schema
No new models. Uses the existing `Friendship` model with the `BLOCKED` status,
which is already in the upstream `FriendStatus` enum (`PENDING`, `ACCEPTED`,
`BLOCKED`).

### Client work required
**Low effort.** Add "Block User" to the user profile / right-click context menu
and a blocked-users list in settings. The DM gateway should check block status
before allowing message sends (server-side enforcement already exists in this
fork; verify whether upstream's DM gateway has the check).

### Dependencies
None.

### Optional or core
Optional but high value-to-effort ratio. This is the cheapest feature to adopt
— no migration, three simple endpoints, minimal UI.

---

## 9. Media proxy (raw + thumbnail)

### What the user gets
Media attachments (images, files) served through OpenShare are proxied through
OpenChat's authentication layer. This means authenticated media URLs work
reliably — no more broken images when OpenShare requires auth the browser can't
provide. Range-request support for video seeking.

### Endpoints

**`GET /media/:assetId/raw`** — serve full-resolution asset
Passes through to OpenShare's `/raw/{id}`, adding auth, Range headers, and
cache-control. Returns the raw bytes with correct Content-Type.

**`GET /media/:assetId/thumb`** — serve thumbnail
Same proxying pattern for thumbnails.

Both endpoints require authentication (`401` if no valid session or bearer
token). This is the whole point: media URLs work inside `<img>` tags in
authenticated contexts.

### Schema
No database changes. These are pure proxy endpoints against the OpenShare HTTP
API.

### Client work required
**None for the web client.** The browser already uses `<img src="/api/media/...">`
— it just works. If the web client currently constructs direct OpenShare URLs,
switch to these proxied URLs for reliability.

### Dependencies
- **OpenShare** must be deployed and configured (`SHARE_BASE_URL` env var).
  Without it, the media controller serves nothing useful but doesn't crash.

### Optional or core
Optional. Essential if you use OpenShare and want reliable media in
authenticated contexts. Harmless (returns 401) if no client calls it.

---

## 10. Granular guild-structure WebSocket events

### What the user gets
When a channel, role, or member changes on a server, the client receives a
specific event (`channel.created`, `member.joined`, `server.updated`, etc.)
instead of a generic `notify` that says "something changed, refetch the entire
server." This means the channel sidebar, role list, and member list update
in-place without flicker or full refetch — the same experience messages already
have.

### Events

Ten new op codes emitted on the WebSocket gateway. All are scoped to the
members of the affected server only:

| Op | Payload | Trigger |
|----|---------|---------|
| `channel.created` | `{channel}` | New channel added |
| `channel.deleted` | `{channelId}` | Channel removed |
| `role.created` | `{role}` | New role created |
| `role.updated` | `{role}` | Role name/color/permissions changed |
| `role.deleted` | `{roleId}` | Role removed |
| `member.joined` | `{member}` | User joins server |
| `member.left` | `{userId}` | User leaves server |
| `member.kicked` | `{userId}` | User kicked |
| `server.updated` | `{server}` | Server name/icon changed |
| `server.deleted` | `{serverId}` | Server deleted |

Payload shapes match what the REST endpoints return for the same objects.
Contract definitions are in `contracts/gateway-events.yaml` (marked
`x-added-by: P3`).

The existing `notify` op is **preserved** — clients that don't handle these new
events continue to receive `notify` and refetch as before. Unknown op codes are
silently ignored by the upstream WebSocket client, so this is a safe,
zero-blast-radius addition.

### Schema
No changes. These events relay data that existing services already publish to
Redis — the gateway simply wasn't forwarding them over WebSockets.

### Client work required
**Low effort.** The web/desktop client already has UI state for channels,
roles, and members. For each event type, add a WebSocket handler that updates
the local store in-place instead of refetching `GET /servers/:id`. This is an
incremental optimisation — you can add handlers one at a time, and the app
works fine without any of them.

### Dependencies
None. Redis pub/sub already carries these events; the gateway change is ~85
lines in `apps/api/src/realtime/events.gateway.ts`.

### Optional or core
Optional but extremely high value-to-effort ratio. This is the cheapest
user-visible improvement in the entire guide.

---

## 11. Channel message search

### What the user gets
Users can search message content within a channel. PostgreSQL full-text search
with relevance ranking.

### Endpoint

**`GET /channels/:id/messages/search`** — search messages in a channel
Query parameters:
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `q` | string | required | Search query (1–200 chars) |
| `limit` | int | 50 | Max 100 |

Response `200` (array of Message objects, same shape as
`GET /channels/:id/messages`):

```json
[
  {
    "id": "msg-uuid",
    "channelId": "ch-uuid",
    "authorId": "user-uuid",
    "content": "Has anyone seen the new update?",
    "createdAt": "2026-07-26T09:30:00.000Z",
    "editedAt": null,
    "deletedAt": null,
    "replyToId": null,
    "pinned": false,
    "author": {
      "id": "user-uuid",
      "username": "alice",
      "displayName": "Alice",
      "avatarUrl": null,
      "status": "ONLINE"
    },
    "attachments": [],
    "reactions": [],
    "replyTo": null,
    "poll": null
  }
]
```
Results are ordered by relevance (PostgreSQL `ts_rank`) then by `createdAt`
descending. Only non-deleted messages are returned.

### Schema
No database changes. Uses PostgreSQL's built-in `to_tsvector`/`plainto_tsquery`
on the existing `Message.content` column.

### Client work required
**Low effort.** Add a search bar to the channel header. Results can render as
a temporary message list with highlighted matches. The endpoint already returns
full Message objects, so the existing message renderer can be reused.

**⚠️ Collision note:** This endpoint uses the path
`GET /channels/:id/messages/search`, which matches upstream's own search path
(see UPSTREAM-DIVERGENCE.md §4). Our fork previously used
`GET /channels/:id/search` but reconciled to the upstream path. If upstream has
already implemented this, the query parameter shapes differ slightly
(upstream: `{q, limit}`; ours: `{q, limit}` — actually identical for the
basic case). Our implementation also supports an `author` and `before`
parameter in the service layer, but only `q` and `limit` are exposed in the
reconciled controller. Verify parameter compatibility before merging.

### Dependencies
None beyond PostgreSQL (already required).

### Optional or core
Optional. Search is a quality-of-life feature; channels work fine without it.

---

## Adoption order

Recommended sequence — each step reduces friction for the next:

### 1. Take these immediately (zero migration, zero risk)
- **Granular WS guild events** — cheapest improvement in the guide. ~85 lines,
  no schema changes, zero blast radius, immediate UX win for any client that
  adds handlers. Do this first.
- **Friend blocking** — literally three routes, no schema changes, high
  user value.
- **Native auth (PKCE)** — no migration, additive, unblocks native clients.
  But: negotiate with upstream about how it coexists with their ApiToken system.
- **Media proxy** — no migration, fixes a real user pain point, zero client
  work for web.
- **Channel message search** — no migration, low client effort.

### 2. Take these next (migration, but standalone)
- **Bans** — one new table, one new permission bit to consider, standalone.
- **Audit log** — no migration if the model already exists upstream; if not,
  it's one table. The read endpoint is additive.
- **Channel categories and reordering** — no migration if the Category model is
  shared; if not, it's one table + nullable FK on Channel. High user impact.

### 3. Take this with commitment (heavy UI work)
- **Permission overwrites** — the highest-value feature for power users, but
  the highest client effort. The backend is solid; budget substantial frontend
  time for the overwrite editor.

### 4. Take this when you're ready for infrastructure
- **Push notifications** — requires FCM project setup, service-account
  credentials, and per-platform client SDK work. The device registry and
  notification-settings endpoints are harmless to adopt early; activating
  actual push dispatch is the late-stage step.

### What you can safely skip
- **Timeouts** — if you're adopting bans, timeouts are incremental. If not,
  they're lower-priority.
- **Server-scoped search** — the divergence report references a
  `GET /servers/:id/search` route, but this is not present in the current code.
  Only channel-scoped search exists today.

---

## Migration summary

| Model | Table | Prisma enum | Priority |
|-------|-------|-------------|----------|
| `DeviceToken` | new | — | Feature 2 |
| `NotificationSetting` | new | `NotificationScope`, `NotificationLevel` | Feature 2 |
| `ChannelOverwrite` | new | `OverwriteTargetType` | Feature 4 |
| `Ban` | new | — | Feature 5 |
| `ServerMember.timedOutUntil` | ALTER TABLE | — | Feature 6 |

`AuditLog` and `Category` are believed to already exist upstream based on the
divergence report's 21-shared-model inventory. Verify before skipping
migrations.

---

## Verification notes

- All request/response shapes are derived from the actual NestJS controller
  decorators, Zod validation schemas, and service return types in
  `apps/api/src/`.
- The Prisma schema at `apps/api/prisma/schema.prisma` was read in full.
- Routes were cross-referenced against `docs/UPSTREAM-DIVERGENCE.md`.
- **UNVERIFIED:** Whether `timedOutUntil` exists on `ServerMember` in the
  upstream schema. The divergence report's field-set diff found no removals; it
  did not explicitly enumerate additions to shared models.
- **UNVERIFIED:** Whether the `AuditLog` and `Category` models exist in
  upstream. The divergence report's 21-shared-model claim implies they do;
  verify against `upstream/main` before skipping migrations.
- **UNVERIFIED:** Whether the `BLOCKED` value in the `FriendStatus` enum exists
  upstream. The `block`/`unblock` endpoints are new, but they use the existing
  `Friendship` table with status `BLOCKED`. If upstream's enum lacks `BLOCKED`,
  that's an enum migration.
