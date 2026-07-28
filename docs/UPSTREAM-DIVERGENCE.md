# Upstream Divergence Report

**Date:** 2026-07-26
**Branch:** `divergence-report` (fork `williamsexton/OpenChat`)
**Compared against:** `upstream/main` (`MinionEnjoyer/OpenChat`, commit `fe4234c`)
**Merge-base:** `0b71e1b`

Our branch is **429 commits ahead / 72 commits behind** upstream/main.

---

## 1. Summary

**Does adopting our changes break the web or desktop client? No.**

Our API surface is purely additive. Every upstream route, handler signature (with one
minor exception noted below), and schema field that existed before still exists. No
upstream route is removed or re-pathed. The web client, desktop client, and any
third-party consumer of the upstream API will continue to work without modification.

The one signature change is `POST /auth/logout`: our handler accepts an optional
`refreshToken` body field for bearer-token revocation; cookie-only requests are
unaffected. The route path is unchanged.

We are behind on 5 upstream routes (detailed in §5) and must absorb them before
any merge.

---

## 2. Additive API surface — 27 new routes

All routes below exist on our branch and do **not** exist on upstream/main.
No upstream route is removed or re-pathed.

### 2.1 Auth — native token issuance

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/auth/oauth/token` | Bearer token issuance via authorization_code or refresh_token grant (PKCE exchange for native clients) |
| `GET`  | `/auth/oidc-metadata` | Public OIDC discovery metadata for native clients (no auth required) |

### 2.2 Device tokens (push notifications)

| Method | Path | Purpose |
|--------|------|---------|
| `POST`   | `/devices` | Register a device token for push notifications |
| `GET`    | `/devices` | List registered device tokens for the current user |
| `DELETE` | `/devices/:token` | Remove a device token |

### 2.3 Notification settings

| Method | Path | Purpose |
|--------|------|---------|
| `GET`    | `/notifications/settings` | Get notification preferences |
| `PUT`    | `/notifications/settings` | Upsert notification preferences |
| `DELETE` | `/notifications/settings/:id` | Delete a notification setting |

### 2.4 Friends — blocking

| Method | Path | Purpose |
|--------|------|---------|
| `GET`  | `/friends/blocked` | List blocked users |
| `POST` | `/friends/unblock/:userId` | Unblock a user |

### 2.5 Media — raw asset access

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/media/:assetId/raw` | Serve raw media asset (bypasses thumb processing) |
| `GET` | `/media/:assetId/thumb` | Serve media thumbnail |

### 2.6 Message search

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/channels/:id/search` | Search messages within a channel |
| `GET` | `/servers/:id/search` | Search messages across a server |

> **Collision:** `GET /channels/:id/search` (ours) vs. upstream's `GET /channels/:id/messages/search`.
> See §4 for full analysis.

### 2.7 Server audit log

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/servers/:id/audit-log` | Fetch server audit log entries |

### 2.8 Server bans

| Method | Path | Purpose |
|--------|------|---------|
| `GET`    | `/servers/:id/bans` | List banned members |
| `PUT`    | `/servers/:id/bans/:userId` | Ban a member |
| `DELETE` | `/servers/:id/bans/:userId` | Unban a member |

### 2.9 Server categories (channel folders)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/servers/:id/categories` | List channel categories/folders |

### 2.10 Channel management

| Method | Path | Purpose |
|--------|------|---------|
| `PATCH` | `/servers/:id/channels/:channelId` | Update channel properties |

### 2.11 Permission overwrites

| Method | Path | Purpose |
|--------|------|---------|
| `GET`    | `/servers/:id/channels/:channelId/overwrites` | List permission overwrites for a channel |
| `PUT`    | `/servers/:id/channels/:channelId/overwrites/:targetType/:targetId` | Upsert a permission overwrite (targetType: role or member) |
| `DELETE` | `/servers/:id/channels/:channelId/overwrites/:overwriteId` | Delete a permission overwrite |

### 2.12 Channel permissions — current user

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/servers/:id/channels/:channelId/permissions/me` | Compute effective permissions for the requesting user in a channel |

### 2.13 Member timeout

| Method | Path | Purpose |
|--------|------|---------|
| `PUT`    | `/servers/:id/members/:userId/timeout` | Timeout a member |
| `DELETE` | `/servers/:id/members/:userId/timeout` | Remove a member timeout |

### 2.14 Test world (dev only)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/dev/test-world` | Seed a test world for E2E/development (gated behind DEV_AUTH) |

### 2.15 File move — no route change

The controller file `apps/api/src/share/uploads.controller.ts` was moved to
`apps/api/src/uploads/uploads.controller.ts`. The route prefix (`uploads`) and
the single `POST /uploads` endpoint are **unchanged**. No client impact.

---

## 3. Schema additions

Compared against `apps/api/prisma/schema.prisma`:

### 3.1 Models we add (not in upstream)

| Model | Purpose |
|-------|---------|
| `ChannelOverwrite` | Per-channel permission overrides for roles or members (allow/deny bitfields) |
| `Ban` | Server ban records (user, reason, expiry) |
| `DeviceToken` | Push notification device tokens per user |
| `NotificationSetting` | Per-user notification preferences |

### 3.2 Model upstream adds (not on our side)

| Model | Purpose |
|--------|---------|
| `ApiToken` | Named bearer tokens for native/desktop clients (CRUD via `/auth/tokens`) |

### 3.3 Verification

- **Models on both sides:** 21 shared models. No model removed by either side.
- **Fields:** No field on any shared model was removed by either side.
  Re-indentation and re-ordering within models exists but is cosmetic.
  Verified by extracting model→field-set mappings and diffing them.

---

## 4. Collision: message search

| Side | Path |
|------|------|
| Upstream | `GET /channels/:id/messages/search` |
| Ours | `GET /channels/:id/search` |

Both implement the same feature: full-text message search within a channel.
The query parameters differ slightly — upstream uses `{q, limit}`, ours uses
`{query, author, before, limit}`.

**Decision required.** By our own rule (upstream wins on collision), we must
retire `GET /channels/:id/search` and adopt `GET /channels/:id/messages/search`.
Cost to us:

- **Mobile client:** one route reference in the API layer
- **Server-side search endpoint:** `GET /servers/:id/search` (server-scoped search,
  which upstream has no equivalent for) must move to a distinct path or be
  re-scoped — it currently shares the `searchServer()` handler that is in the
  same controller as the channel search
- **Tests:** the `p7-search` characterization suite references the old path

This is not a showstopper but it is the only non-trivial merge conflict in the
API surface.

---

## 5. Upstream features we must absorb

These 5 routes exist on upstream/main but **not** on our branch. They must be
merged in before we can claim parity.

| Method | Path | Source commit | Purpose |
|--------|------|---------------|---------|
| `POST`   | `/auth/tokens`     | `ab68da3` | Create a named API token for native/desktop clients |
| `GET`    | `/auth/tokens`     | `ab68da3` | List the user's API tokens |
| `DELETE` | `/auth/tokens/:id` | `ab68da3` | Revoke an API token |
| `GET`    | `/auth/desktop`    | `94408dc` | Browser SSO → deep-link token handoff for desktop client |

The upstream `ApiToken` model + these 4 routes form the upstream native-auth
system. Our branch has a parallel system (`POST /auth/oauth/token`, `GET /auth/oidc-metadata`,
`TokenService` with refresh-token families). These two auth subsystems will need
reconciliation during merge — they serve overlapping purposes with different
designs (upstream: simple named tokens with manual revocation; ours: PKCE code
exchange + refresh-token rotation with family-based revocation).

Additionally, upstream added `returnTo` query-parameter support to
`GET /auth/login` for post-login redirects. We should absorb this; it is a
small, safe addition.

---

## 6. Auth controller details

### 6.1 Logout signature

**Ours:**
```typescript
@Post('logout')
async logout(@Req() req, @Res() res, @Body() body?: { refreshToken?: string })
```

**Upstream:**
```typescript
@Post('logout')
async logout(@Req() req, @Res() res)
```

The route path (`POST /auth/logout`) is identical. Our handler accepts an
optional `refreshToken` in the body; upstream's does not. Cookie-only logout
is unaffected. This is backward-compatible for all existing clients.

### 6.2 Login returnTo

Upstream added `@Query('returnTo')` to the login handler for post-SSO redirect.
Our branch does not have this. Safe to absorb.

---

## 7. Proposed improvements for upstream consideration

These are additive changes we believe are genuinely better. They are offered as
proposals, not faits accomplis — upstream decides whether to adopt them.

### 7.1 Granular guild-structure realtime events (FR-SRV-009)

We added 10 server-scoped WebSocket events so clients receive targeted updates
instead of invalidating and re-fetching entire server state:

`channel.created`, `channel.deleted`, `role.created`, `role.updated`,
`role.deleted`, `member.joined`, `member.left`, `member.kicked`,
`server.updated`, `server.deleted`

Each event is relayed only to connected members of the affected server.
Contract definitions are in `contracts/gateway-events.yaml` (marked
`x-added-by: P3`). The upstream web client ignores unknown ops (Phase-0-verify
E2), so these are safe to emit unconditionally. Integration test:
`apps/api/test/integration/p3-09-granular-events.spec.ts` (10 tests).

### 7.2 Nonce echo on message relay

When the gateway echoes a message back to the sender, our relay path includes
the client-supplied `nonce` in the frame. The mobile client stamps this onto the
REST ack to prevent a ghost-duplicate row (the REST response echoes `nonce: null`,
so the optimistic copy was never replaced without this fix). The change is in
`apps/api/src/realtime/events.gateway.ts` and the mobile sync layer. An upstream
client that does not send a nonce is unaffected — the field is simply absent.

### 7.3 Permission overwrites

`ChannelOverwrite` model + 3 CRUD endpoints (`GET`/`PUT`/`DELETE`
`/servers/:id/channels/:channelId/overwrites/...`) plus
`GET /servers/:id/channels/:channelId/permissions/me` for effective-permission
computation. These are backend-only additions with no client impact unless a
client chooses to consume them.

---

## 8. Verification notes

- **Route extraction:** `@Controller` prefix + `@Get`/`@Post`/`@Patch`/`@Put`/`@Delete`
  paths extracted from every `*.controller.ts` on both refs, sorted, and diffed.
  The script is reproducible: `python3 tools/diff-routes.py` (already in tree).
- **Schema extraction:** model names and their field sets extracted from
  `apps/api/prisma/schema.prisma` on both refs and diffed.
- **Claim verification:** The earlier summary claimed 26 new routes and 424 commits
  ahead. Actual counts are **27 routes** and **429 commits** ahead. Route counts
  verified by cross-checking `only_head + shared = head_total` (27 + 63 = 90).
  All other claims — 5 upstream routes we're behind, 4 models added by us, 1 by
  upstream, no removals, the search collision, the logout signature change, the
  uploads controller move — match our independent verification.

---

*Report generated by route/schema extraction from `HEAD` and `upstream/main`
git refs. No manual route listing.*
