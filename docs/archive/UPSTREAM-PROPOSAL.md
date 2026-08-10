# UPSTREAM-PROPOSAL — features to offer back to OpenChat upstream

**Date:** 2026-07-26
**Audience:** Upstream maintainer (MinionEnjoyer/OpenChat)
**Context:** These three features were built in our fork (openchat-drift-triage) while
implementing an Android mobile client. They are genuine improvements to the server —
additive, backward-compatible, and useful to web and desktop clients. None requires the
mobile client to be useful.

All three are independently mergeable. None changes an existing API contract or database
column; they add new capabilities, endpoints, and event types.

---

## Proposal 1: Granular guild-structure realtime events

**Spec ref:** FR-SRV-009
**Commit:** `038eda0` (2026-07-25)
**Files:** `apps/api/src/realtime/events.gateway.ts`

### Problem

When a channel, role, or member changes on a server, the only realtime event emitted is
`notify` — a coarse invalidation that says "something changed on this server, refetch
everything." Clients respond by re-fetching the full server object (`GET /api/servers/:id`),
which pulls channels, roles, and member lists over REST even when a single channel name
changed.

This wastes bandwidth and causes perceptible UI flicker: the channel list vanishes and
reappears because the client replaces the entire tree. It also couples channel/role/member
operations to REST round-trips, making them feel slower than message operations (which
arrive granularly via `message.created` / `message.updated`).

### Change

Added 10 event types to the BusEvent union and relay logic:

| Event op | Payload | Audience |
|---|---|---|
| `channel.created` | `{channel}` | All server members |
| `channel.deleted` | `{channelId}` | All server members |
| `role.created` | `{role}` | All server members |
| `role.updated` | `{role}` | All server members |
| `role.deleted` | `{roleId}` | All server members |
| `member.joined` | `{member}` | All server members |
| `member.left` | `{userId}` | All server members |
| `member.kicked` | `{userId}` | All server members |
| `server.updated` | `{server}` | All server members |
| `server.deleted` | `{serverId}` | All server members |

Server membership is tracked per-connection: loaded from Prisma at connect, updated
dynamically when `MEMBER_JOINED` / `MEMBER_LEFT` / `MEMBER_KICKED` events arrive. Audience
scoping is correct — a user only receives events for servers they belong to, and their own
join/leave updates their membership set for other sockets.

The `notify` op is **preserved** — clients that don't handle the new events continue to
work exactly as before, receiving `notify` and refetching. The granular events are
additive.

### Why it's worth adopting

- **Zero blast radius on existing clients.** Unknown WS op codes are ignored. The `notify`
  op still fires. Web and desktop clients continue to work with zero changes.

- **Measurable UX improvement.** A web client that handles these events can update the
  channel sidebar, role list, and member list in place — same as it already does for
  messages. No refetch, no flicker.

- **Minimal implementation surface.** 85 lines in one file (`events.gateway.ts`). The
  pattern is identical to existing per-user events (`notify`, `mention`, `call.ring`).
  No new dependencies, no database changes, no REST endpoint changes.

- **Services already publish the right events.** The existing `ServersService`,
  `ChannelsService`, `RolesService`, and membership handlers already publish
  `CHANNEL_CREATED`, `MEMBER_JOINED`, etc. to Redis — the gateway just wasn't relaying
  them. This proposal connects what's already being published.

### Blast radius on web/desktop

None. Additive only. No existing op code changes, no REST contract changes, no database
migration. Web clients that want incremental UI updates can add handlers for the new ops
at their own pace.

---

## Proposal 2: Nonce propagation through Redis→WS relay for REST-originated messages

**Spec ref:** FR-MSG-002
**Commit:** `b7319b7` (2026-07-25)
**Files:** `apps/api/src/realtime/events.gateway.ts`, `apps/api/src/messages/messages.service.ts`

### Problem

OpenChat already handles optimistic-send reconciliation correctly for messages sent via
WebSocket: the `message.send` WS handler echoes the client's nonce back to the sender in
the `message.created` event, so the client can match the server-confirmed message to its
pending optimistic copy.

But when a client sends a message via REST (`POST /channels/:id/messages`), the nonce is
lost. The REST response echoes `nonce: null`, and the WS relay broadcasts
`message.created` to all subscribers without a nonce. The sending client receives the
relayed event, cannot match it to its pending message, and shows a ghost duplicate — a
greyed-out row next to the real message. The duplicate resolves on the next full refetch,
but the flicker is visible and jarring.

This affects any client that sends messages via REST with optimistic UI — which includes
the web client if it ever uses REST for sends, and definitely includes any mobile or
third-party client.

### Change

Two-line change in `messages.service.ts:279`:
```ts
// Before:
await this.redis.publish('chat:events', { type: 'MESSAGE_CREATED', message: dto });

// After:
await this.redis.publish('chat:events', { type: 'MESSAGE_CREATED', message: dto, nonce: data.nonce });
```

Corresponding relay change in `events.gateway.ts` — the `MESSAGE_CREATED` case now
includes the nonce in the envelope, **scoped to the message author only**:
```ts
case 'MESSAGE_CREATED': {
  const d: any = { message: event.message };
  if (event.nonce && client.userId === event.message.authorId) {
    d.nonce = event.nonce;
  }
  this.send(client.socket, { op: 'message.created', d });
  break;
}
```

The nonce is only echoed to the author. Other subscribers receive `{message}` without
nonce, same as before. This prevents information leakage (other users don't learn the
sender's idempotency key) while giving the sender exactly what it needs for reconciliation.

### Why it's worth adopting

- **Fixes a real user-visible bug.** The ghost-duplicate row is visible on every
  optimistic REST send. Web clients that send via REST will see it.

- **Scoped correctly.** Nonce goes to the author only. Other subscribers see the same
  payload they always did.

- **WS path is already correct.** Upstream already handles this for WS `message.send`.
  This fix extends the same guarantee to the REST path, completing the loop.

- **Two lines of logic, zero schema changes.** The nonce was already flowing through the
  REST handler — it just wasn't being forwarded to the relay.

### Blast radius on web/desktop

Zero. The `nonce` field in the `message.created` envelope is optional (`nonce?`).
Subscribers other than the author never see it. Existing web clients that don't look for
nonce are unaffected. Web clients that do optimistic REST sends get the fix for free.

---

## Proposal 3: Channel permission overwrites (Discord precedence)

**Spec ref:** FR-ROLE-003
**Commit:** `c497ef3` (2026-07-25)
**Files:** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20260725153850_add_channel_overwrites/`, `apps/api/src/overwrites/overwrites.service.ts`, `apps/api/src/permissions/permissions.ts`, `apps/api/src/servers/servers.controller.ts`

### Problem

OpenChat's permission model is flat: a user's permissions in a channel are the union of
their role permissions across the server. There is no way to say "Moderators can send
messages here but @everyone cannot" or "This specific user is muted in #announcements."
This is the most-requested permission feature in Discord-like platforms and is one of the
gaps flagged in the master spec (G5: "server has no support").

### Change

**Data model** — New `ChannelOverwrite` table:
```prisma
model ChannelOverwrite {
  id         String              @id @default(uuid())
  channelId  String
  targetType OverwriteTargetType // ROLE | MEMBER
  targetId   String              // role ID or user ID
  allow      BigInt              @default(0)
  deny       BigInt              @default(0)
  channel    Channel             @relation(fields: [channelId], references: [id], onDelete: Cascade)

  @@unique([channelId, targetType, targetId])
  @@index([channelId])
}
```

**REST endpoints** (in `servers.controller.ts`):
- `GET /servers/:id/channels/:cid/overwrites` — list overwrites for a channel
- `PUT /servers/:id/channels/:cid/overwrites/:type/:targetId` — create or update (upsert)
- `DELETE /servers/:id/channels/:cid/overwrites/:type/:targetId` — remove an overwrite

All endpoints require membership in the server.

**Permission resolver** (`permissions.ts`) — pure function implementing Discord's
documented precedence order:
1. Tier 0: @everyone role base permissions
2. Tier 1: Role overwrites (allow applied, then deny — deny beats allow within tier)
3. Tier 2: Member overwrites (same allow-then-deny pattern)
4. Bypass: Server owner OR any role with ADMINISTRATOR → all permissions

The resolver feeds into the existing `hasPermission()` check in `messages.service.ts`,
so an overwrite that denies `SEND_MESSAGES` actually prevents sending. This is not
cosmetic — overwrites change what users can do.

**Tests** — 26 golden-table tests (`permissions.golden.spec.ts`) covering:
- ADMINISTRATOR bypass
- Server owner bypass
- @everyone base deny + role allow
- @everyone base allow + role deny (deny wins)
- Multi-role union (allow from one + deny from another → deny wins)
- Member overwrite overriding role overwrite
- Member allow beating role deny (higher tier)

### Why it's worth adopting

- **Completes the permission model.** Without overwrites, the "announcement channel"
  use case (FR-SRV-010) is impossible — you can't make a channel read-only for @everyone
  while letting moderators post.

- **Follows Discord's documented precedence.** The resolver matches Discord's published
  rules exactly. Any client that understands Discord's permission model will produce the
  same results.

- **Additive, not breaking.** The migration creates a new table. No existing columns
  change. Channels with zero overwrites behave identically to before. The `hasPermission()`
  check in messages.service.ts falls through to the existing path when no overwrites match.

- **Web UI can be added incrementally.** The endpoints and resolver work today. A web
  client can add the overwrite editor UI later without any server changes.

- **Tested.** 26 golden-table tests + 11-suite characterization suite (89 tests) pass
  untouched, confirming no regression in existing permission behavior.

### Blast radius on web/desktop

Minimal. New endpoints are additive. Existing endpoints unchanged. The permission check
in `messages.service.ts` is extended, not replaced — when a channel has zero overwrites,
the resolver returns the base permissions unchanged. A web client that never calls the new
endpoints sees exactly the same behavior as before. Adding the UI layer is optional and
can follow at any pace.

---

## Merge order recommendation

These three proposals are independent and can be merged in any order. Recommended sequence:

1. **Nonce propagation** (Proposal 2) — smallest change, fixes a bug, zero blast radius.
2. **Granular guild events** (Proposal 1) — additive WS events, services already publish them.
3. **Permission overwrites** (Proposal 3) — largest change, includes migration + new endpoints.

Each is self-contained and can be reviewed on its own diff.

## What we did NOT propose

These were considered and rejected for upstream:

- **Mobile client nonce-stamping on REST responses** — The mobile client's workaround
  (`ChatPane.tsx:322`) stamps the client nonce onto the server's REST response when the
  server echoes `nonce: null`. This is a mobile-specific belt-and-suspenders; Proposal 2
  fixes the root cause at the server level, making the client workaround unnecessary for
  any client that listens to WS events.

- **Expo-notifications vs Firebase** — Our mobile client uses `expo-notifications` instead
  of `@react-native-firebase/messaging`. This is an Expo SDK 57 platform decision specific
  to our React Native build. Upstream has no push notifications at all, so there is nothing
  to propose.

- **FR-ROLE-002 shared permission lib** — We accepted a deviation where the mobile client
  mirrors the server's `permissions.ts` instead of sharing it via npm workspaces. The
  compensating control (codegen from single contract + bit-agreement test) achieves the
  same safety. We did not propose this because it's a repo-structure question, not a
  feature — upstream may prefer a different approach.
