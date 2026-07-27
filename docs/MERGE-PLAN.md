# Merge Plan: integration → origin/main

**Date:** 2026-07-26
**Branch:** merge-dryrun (throwaway)
**Ahead/behind:** 429 ahead, 72 behind origin/main

## Executive Summary

Four conflicted files — **the prior belief was correct** in both count and file list. All four
are in `apps/api/`. No web, desktop, or mobile client files conflict. No contract changes from
upstream. The auth union is achievable by keeping both token systems side-by-side; forcing
mobile to adopt upstream's static-token design would be a UX regression and is not recommended.

---

## Conflict Inventory

### 1. `apps/api/prisma/schema.prisma`

**Lines:** 66–75 (User model relations)
**Nature:** Adjacent-field additions in the same model block.
- **Ours:** `deviceTokens DeviceToken[]`, `notificationSettings NotificationSetting[]` (mobile push)
- **Upstream:** `apiTokens ApiToken[]`

**Resolution:** UNION — keep all three. One-liner text conflict. Add all three relations to
the User model.

**Risk:** None. Both sides' models (`DeviceToken`, `NotificationSetting`, `ApiToken`) already
exist in the file and merged cleanly.

---

### 2. `apps/api/src/auth/auth.controller.ts`

**Conflict A — lines 2–7 (imports):**
- **Ours:** adds `BadRequestException` (needed by our `POST /auth/token` endpoint)
- **Upstream:** adds `Delete, Param, Query` (needed by upstream's `DELETE /auth/tokens/:id`)

**Resolution:** UNION — keep all. Add both sides' imports.

**Conflict B — lines 100–106 (callback redirect):**
- **Ours:** `res.redirect('/')` — always redirects to root after SSO
- **Upstream:** `res.redirect(dest)` — respects the `returnTo` query parameter set during
  login flow, enabling deep-link flows like `/api/auth/desktop`
- Also: `catch (_err)` (ours) vs `catch (err)` (upstream) — upstream's `err` is correct since
  the variable is used in the error handler (the retry counter is checked).

**Resolution:** Take upstream's `res.redirect(dest)` (preserves the returnTo feature needed
by `/auth/desktop`). Take upstream's `catch (err)` (correct variable naming). Keep our
`BadRequestException` import.

**Risk:** Very low. Our side's redirect to `'/'` was less functional; upstream's version is
a strict superset that honors the redirect intent.

---

### 3. `apps/api/src/messages/messages.service.ts`

**Conflict A — lines 4–9 (imports):**
- **Ours:** `AuditLogService` from `'../audit-log/audit-log.service'`, `ServersService`
- **Upstream:** `PresenceService` from `'../realtime/presence.service'`

**Conflict B — lines 97–103 (constructor injection):**
- **Ours:** `private readonly auditLog: AuditLogService`, `private readonly servers: ServersService`
- **Upstream:** `private readonly presence: PresenceService`

**Usage in file:**
- Ours uses `this.auditLog.write()` at lines 586, 646 (audit-logging message create/delete)
  and `this.servers.assertNotTimedOut()` / `this.servers.getChannelPermissions()` at lines
  238, 240 (permission checks).
- Upstream uses `this.presence.isActive()` at line 420 for `@here` mention fan-out (only
  pings users who are ONLINE/AWAY/DND).

Both services are used in non-overlapping parts of the file.

**Resolution:** UNION — keep all three. Both the `PresenceService` import+injection AND the
`AuditLogService` + `ServersService` imports+injections.

**Risk:** Low. `PresenceModule` is `@Global()`, so it's available regardless. Test that
mentions still fire correctly for both `@here` (presence-gated) and `@user` (direct).

---

### 4. `apps/api/src/share/share.service.ts`

This is the most complex conflict (four conflict regions).

**Conflict A — lines 1–49 (imports, preamble, `UploadedAttachment`):**
- **Ours:** `HttpException, HttpStatus, Logger, Module` from `@nestjs/common`, `Readable` +
  `WebReadableStream` from `'stream'`, extensive JSDoc for FR-MED-001/002/003, `UploadedAttachment`
  with `id` field.
- **Upstream:** `HttpException, HttpStatus, NotFoundException` from `@nestjs/common`,
  `PrismaService` import, `UploadedAttachment` without `id`.

**Conflict B — lines 50–79 (interface definitions):**
- **Ours:** `AssetMetadata` interface (full spec per 14-PHASE5-MEDIA.md), `ShareUploadResponse`.
- **Upstream:** `UploadInput` interface, `ShareUploadResult`.

**Conflict C — lines 91–99 (constructor):**
- **Ours:** `constructor(private configService: ConfigService)` — no PrismaService.
- **Upstream:** `constructor(private readonly configService: ConfigService, private readonly prisma: PrismaService)`.
- Both sides set `shareBaseUrl` and `shareApiKey`.

**Conflict D — lines 388–395 (end of file):**
- **Ours:** `@Module({...}) export class ShareModule {}` — our inline module definition.
- **Upstream:** Constructor that belongs to upstream's simpler ShareService (no module
  decorator — module is in `share.module.ts`).

**Resolution:** Keep our expanded ShareService body (FR-MED-001/002/003: bearer-token
service API upload, media proxy, cookie fallback). Merge upstream's additions:
- Add `PrismaService` to import + constructor (needed for upstream usage, e.g. in
  `uploads.controller.ts` which auto-merged)
- Add `UploadInput` + `ShareUploadResult` interfaces from upstream
- Keep our `AssetMetadata` + `UploadedAttachment` with `id` field
- Keep our `Logger` import (used in `ensureSession`, etc.)
- **REMOVE** the `@Module` decorator from share.service.ts — the module is now in
  `share.module.ts` (auto-merged cleanly from upstream)
- Remove `Module` from the import

**Risk:** Medium. This file has the most structural divergence. The upstream `share.service.ts`
is a much simpler file (~100 lines focusing on upload). Our version is ~460 lines with
service API, media proxy, and cookie fallback. Verify:
1. `share.module.ts` is imported in `app.module.ts` (confirmed: auto-merged correctly as
   `ShareModule` from `'./share/share.module'`)
2. The `PrismaService` injection in our constructor doesn't conflict with our existing
   `ConfigService` usage
3. `uploads.controller.ts` still compiles against the resolved `ShareService`

---

## Auth UNION Assessment

### Two Token Systems

| Aspect | Upstream (ab68da3 + 94408dc) | Ours (P1-01/P1-02/P1-03) |
|--------|------------------------------|---------------------------|
| **Model** | `ApiToken` (Prisma) — long-lived, stored hash | `TokenService` (Redis + JWT) — short-lived access + refresh rotation |
| **Creation** | Manual via web UI: `POST /auth/tokens` | PKCE exchange: `POST /auth/token` with `grantType=authorization_code` |
| **Guard** | `SessionGuard` (enhanced, `apps/api/src/auth/session.guard.ts:11-33`) — checks `Authorization: Bearer oc_*` header, looks up hash in DB | `AuthGuard` (`apps/api/src/auth/auth.guard.ts:13-49`) — verifies JWT, falls back to session cookie |
| **Refresh** | None — user creates a new token when expired | `POST /auth/token` with `grantType=refresh_token` — rotation with family revocation on theft |
| **Target** | Desktop (paste-once, long-lived) | Mobile (PKCE native flow, auto-refresh) |

### Key difference in guards

The upstream `SessionGuard` (`apps/api/src/auth/session.guard.ts`) was auto-merged and now
includes BOTH the session-cookie check AND the bearer-token check (ApiToken hash lookup).
Our `AuthGuard` (`apps/api/src/auth/auth.guard.ts`) is a separate guard that checks JWT
bearer tokens first, then falls through to session.

**In the merged `auth.controller.ts`:**
- `POST /auth/token` (ours) is **public** (no guard) — the PKCE endpoint
- `GET/POST/DELETE /auth/tokens` (upstream) use `@UseGuards(SessionGuard)` — session-gated,
  and SessionGuard now also accepts ApiToken bearer tokens
- `GET /auth/me`, `PATCH /auth/me`, etc. use `@UseGuards(AuthGuard)` (ours) — accepts
  JWT bearer OR session

### UNION Verdict: Achievable as side-by-side coexistence

The two systems serve **different clients** and do **not conflict**:

1. **Desktop** uses upstream's `ApiToken` path:
   - User creates token in web UI → pastes into desktop app
   - `SessionGuard` validates the `oc_` bearer token
   - OR: browser SSO via `/auth/desktop` → deep-link token handoff

2. **Mobile** uses our PKCE path:
   - App opens browser for OIDC → receives auth code → posts to `/auth/token`
   - Receives `{ accessToken, refreshToken }` → uses `AuthGuard` for subsequent calls
   - Auto-refreshes via `/auth/token` with `grantType=refresh_token`

**No mobile client changes required.** The two systems share no endpoints and use
different guard decorators. They coexist at different URL paths (`/auth/token` vs
`/auth/tokens`).

### ⚠️ Critical finding: forcing UNION as "adopt upstream's design" is NOT recommended

The prior decision assumed mobile should conform to upstream's static-token design.
This would require:

- **Mobile client changes:**
  - Replace PKCE auth flow with manual token input screen
  - Remove refresh-token rotation logic
  - Remove `POST /auth/token` usage; switch to `Authorization: Bearer oc_<raw>` headers
  - Remove JWT expiry tracking; handle static token expiry by prompting user to re-paste
  - Estimated: significant UX regression for mobile users
- **Server changes:**
  - Remove `TokenService`, `AuthGuard`, `POST /auth/token` endpoint
  - This would also break our existing mobile test harness (`apps/mobile/e2e/` may depend
    on PKCE flow for test user auth)

**Recommendation:** Keep both. The side-by-side approach is clean — no mobile changes,
no UX regression. If a unified auth model is desired long-term, extend upstream's
`ApiToken` system to also support short-lived JWTs with automatic rotation, then migrate
mobile to that — but this is new feature work, not a merge-resolution decision.

---

## Web/Desktop-Forcing Changes

**None.** All upstream client-side changes auto-merged cleanly:

- `apps/web/` — new `yt-party.html` (YouTube watch party iframe), nginx `client_max_body_size`,
  presence-related store updates, message store refactors. All additive.
- `apps/desktop/` — entirely new directory (Tauri v2 desktop app). No conflicts with our tree.
- `apps/mobile/` — untouched by upstream (our domain).
- `contracts/` — no changes from upstream.

The auto-merged `session.guard.ts` now accepts both `oc_` ApiTokens (upstream) and
session cookies — but this is backward-compatible and doesn't force web changes.

---

## Ordered Reconciliation Sequence

Resolve in this order for cascading simplicity:

1. **`schema.prisma`** — Trivially resolved first. No dependencies. Just add all three
   relations. Generate Prisma client and verify migration is clean.

2. **`messages/messages.service.ts`** — Simple union of imports + constructor args.
   Verify compilation after resolution.

3. **`share/share.service.ts`** — Most complex. Resolve before auth.controller because
   `share.module.ts` needs a clean `ShareService` without the inline `@Module` decorator.
   Verify `app.module.ts` imports `ShareModule` from `'./share/share.module'` (auto-merged).

4. **`auth/auth.controller.ts`** — Resolve last since it depends on both `TokenService`
   (our injectable) and upstream's `createToken`/`revokeToken`/`listTokens` endpoints.
   Verify both guard types (`AuthGuard` on our endpoints, `SessionGuard` on upstream's)
   and that `POST /auth/token` remains unguarded.

After all four resolved:
- Run `npx prisma generate`
- Run `npx tsc --noEmit` for full type-check
- Run contract test suite: `jest --config jest-contract.config.js`
- Run integration test suite: `jest --config jest-integration.config.js`

---

## Owner Decisions Required

1. **Auth strategy confirmation:** Side-by-side (keep both token systems) vs. force
   mobile to conform to upstream's ApiToken design. **Recommended: side-by-side.**

2. **`share.service.ts` PrismaService injection:** Upstream's
   `uploads.controller.ts` (auto-merged) may depend on `PrismaService` being
   available in `ShareService`. Verify this — if not needed, the injection is
   dead weight. **Needs code inspection of `uploads.controller.ts`.**

3. **`PresenceService` availability in MessagesService:** The upstream
   `PresenceModule` is `@Global()`, so injection should work. But verify that
   the `@here` mention path (`messages.service.ts:420`) works correctly with our
   existing mention fan-out logic. Our side also has `@user` and `@role` mention
   resolution that must not regress.

4. **`devLogin` return value:** Our `POST /auth/dev-login` returns
   `{ ...user, ...tokens }` (including bearer tokens for mobile test path).
   Upstream's returns just `user`. The auto-merged version keeps our return
   (our side's content was in the same region as the non-conflicting body).
   Verify this is intentional — the mobile e2e tests may depend on tokens
   being returned from dev-login.
