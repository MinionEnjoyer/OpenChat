# 03 — CONTRACTS: Machine-Readable API, Gateway & Asset Contracts

Goal: one source of truth for every interface the mobile app touches, versioned in-repo,
verified by contract tests on BOTH sides, with generated TypeScript types so drift between
server and client is a compile error, not a runtime surprise. ("Type Safety End-to-End" is
already a stated OpenChat principle — this operationalizes it.)

## 1. Artifacts (all under `OpenChat/contracts/`)

| File | Format | Covers |
|------|--------|--------|
| `openapi.yaml` | OpenAPI 3.1 | Every OpenChat REST route (existing + added by phases) |
| `gateway-events.yaml` | AsyncAPI 2.6 | WS envelope + every c2s/s2c op |
| `share-assets.yaml` | OpenAPI 3.1 | OpenShare: current cookie routes (documented as-is) + the Phase-5 service asset API |
| `permissions.json` | JSON | Bitfield names→bits, copied by codegen from `apps/api/src/permissions/permissions.ts` (that TS file stays the single source) |

Authoring rules: contracts are written from Phase 0 **observed** behavior (E-experiments), not
from code reading alone. Fields observed but undocumented get documented; fields never
observed get `x-unverified: true` and MUST NOT be used by the client until verified.

## 2. Initial REST inventory to encode (verified statically 2026-07-20; Phase 0 confirms shapes)

All under prefix `/api`, auth `session` today (Phase 1 adds `bearer` as an alternative on every
guarded route — modeled as OpenAPI security schemes `cookieAuth | bearerAuth`):

- auth: `GET login` · `GET callback` · `POST logout` · `POST dev-login` (dev-only) ·
  `GET me` · `PATCH me` `{username?,displayName?,avatarUrl?,status?}` ·
  `PUT server-layout` `{layout}` · `GET ws-ticket`
- config: `GET /config` (public client config incl. `shareBaseUrl`)
- health: `GET /health`
- servers: `GET permissions` · `GET /` · `POST /` · `GET :id` · `PATCH :id` · `DELETE :id` ·
  sounds `GET|POST|PATCH|DELETE` · channels `GET :id/channels` · `POST :id/channels` ·
  `PATCH :id/channels/reorder` · `DELETE :id/channels/:channelId` ·
  members `GET` · `POST` · `DELETE me` · `DELETE :userId` ·
  roles `GET|POST|PATCH|DELETE` · member-roles `PUT|DELETE :id/members/:userId/roles/:roleId`
- invites: `POST servers/:id/invites` · `GET invites/:code` · `POST invites/:code/accept`
- messages: `GET channels/:id/messages?before&limit` · `POST channels/:id/messages`
  `{content, attachments?, nonce?}` · `PATCH messages/:id` · `DELETE messages/:id` ·
  `POST messages/:id/reactions` · `DELETE messages/:id/reactions/:emoji` ·
  `GET channels/:id/pins` · `PATCH messages/:id/pin` · `POST channels/:id/polls` ·
  `POST polls/options/:optionId/vote` · `POST channels/:id/read`
- dms: `GET /dms` · `POST /dms`
- friends: `GET /` · `GET requests` · `POST requests` · `POST requests/:id/accept` ·
  `POST requests/:id/decline` · `DELETE :userId` · `POST block/:userId`
- notifications: `GET /notifications`
- server-invitations: `POST server-invitations/:id/accept` · `POST server-invitations/:id/decline` (not under /notifications prefix; controller is @Controller() with no prefix)
- voice: `POST :channelId/join` · `POST :channelId/leave` · `GET :channelId/participants`
- watchparty: library/image/stream/state routes (document; client use is P2)
- gifs: `GET /gifs/search`

## 3. Gateway protocol to encode

Envelope `{op: string, d: object, id?: string}`. Connect: `GET /ws?ticket=<t>`; close codes
`4401` invalid ticket, `4404` user missing; server ws-ping every 30s (client must answer pong
at the ws protocol level — verify library default in Phase 1).

- c2s: `ping` · `subscribe {channelIds:[…]}`(shape per E2) · `unsubscribe` ·
  `message.send` · `typing.start {channelId}` · `presence.update {status}`
- s2c: `ready {user, servers:[]}` · `error {message}` · `message.created {message}` ·
  `message.updated {message}` · `message.deleted {id, channelId}` ·
  `typing {channelId, userId}` · `presence {userId, status}` ·
  `watchparty.sync {channelId, state}` · `notify {}` ·
  `mention {channelId, messageId, channelName, authorName, preview}` ·
  `call.ring {channelId, callerId, callerName, callerAvatar}`

Delivery semantics to document explicitly (from E2/E3/E7): channel-scoped events require prior
`subscribe`; `presence` is global; reactions/pins arrive as `message.updated`; guild-structure
changes currently arrive only as `notify` (until FR-SRV-009). Ops added by later phases are
appended here with `x-added-by: <phase>`.

## 4. Codegen (deterministic, committed output)

- `tools/codegen/gen.mjs`: `openapi-typescript` → `apps/mobile/src/api/schema.d.ts`; a small
  hand-written typed fetch wrapper consumes it (no heavyweight client generator). AsyncAPI →
  `apps/mobile/src/realtime/events.d.ts` via a bespoke ~100-line generator (discriminated
  union on `op`) — bespoke because it must stay dependency-light and exact.
- Generated files are committed; `devctl verify` regenerates and fails on git diff
  (drift gate). The API may also import the generated types in new code (never retrofit old).

## 5. Contract tests (both directions)

- **Provider side** (`apps/api/test/contract/`): for every route/op in the contracts, a Jest
  test hits the running dev stack and validates response/event against the schema (ajv).
  These subsume Phase-0 characterization tests where they overlap; keep both files but share
  fixtures.
- **Consumer side** (`apps/mobile/src/api/__tests__/contract/`): the mobile API layer runs
  against a schema-driven mock derived from the same contracts (msw + ajv), ensuring the app
  only sends shapes the contract allows.
- Rule: **contract change protocol** — any PR touching `contracts/` MUST contain, in the same
  PR: server change (if provider), regenerated types, updated provider contract test, and a
  changelog line in `contracts/CHANGELOG.md` (`<date> <phase-item> <op/route> <add|change>`
  — additive-only during Phases 1–7; breaking changes forbidden without a Decision Record).

## 6. DoD for this spec (executed as work items P0-07..P0-09 immediately after Phase 0 gates)
`contracts/*` cover 100% of the §2/§3 inventory with zero `x-unverified` on routes the app
will use in Phases 1–4 · codegen runs clean and output committed · provider contract suite
green vs dev stack · consumer mock harness proven with one round-trip test · CHANGELOG seeded.
