# DRIFT-TRIAGE — full classification of every DRIFT-LOG entry

**Date:** 2026-07-26
**Purpose:** Phase sign-off gate (PRIORITIES.md §1a). Every entry in `docs/DRIFT-LOG.md`
is sorted into exactly one bucket: A (REVERT), B (PROPOSE UPSTREAM), C (FORK-LOCAL),
D (OPEN QUESTION). No entry is left unbucketed.

## Summary counts

| Bucket | Count | Meaning |
|---|---|---|
| **A** — REVERT | 0 | No divergence was an accident that upstream wins |
| **B** — PROPOSE UPSTREAM | 4 | Genuinely better, should be offered upstream |
| **C** — FORK-LOCAL | 24 | Process/tooling/testing/mobile-only; no upstream implication |
| **D** — OPEN QUESTION | 1 | Needs the owner's decision |

## Bucket B items (upstream proposals)

| # | Name | DRIFT-LOG ref |
|---|---|---|
| B1 | Granular guild-structure events (FR-SRV-009) | Supplemental — code exists, no DRIFT-LOG entry |
| B2 | Nonce propagation through Redis→WS relay | DRIFT-12c |
| B3 | Channel permission overwrites (FR-ROLE-003) | Supplemental — code exists, no DRIFT-LOG entry |
| B4 | Gateway contract: `message.created` envelope shape | DRIFT-12c (same fix as B2) |

## Bucket D item (owner decision required)

| # | Name | What the owner must decide |
|---|---|---|
| D1 | E-01 Markdown renderer gap | `apps/web` has no markdown renderer (only URL + @mention detection).
FR-MSG-007 criterion "matches web client semantics" is currently unsatisfiable as written.
Options: (a) implement markdown in web, (b) trim FR-MSG-007 to what web actually does,
(c) accept mobile's Discord-flavored dialect as the reference. |

---

## Full triage table

### DRIFT-01 — E5 downgraded to source inspection (P0-03)

- **What:** Agent substituted source-code reading for a live OpenShare upload experiment.
- **Bucket: C** — Fork-internal process violation. No code divergence from upstream. Fixed via P0-02a bypass + E5 re-execution.
- **Blast radius:** None outside our fork.

### DRIFT-02 — P0-04 audit findings (D1: Tripwire holes, D2-D4)

- **What:** `assertMessageShape` checked only required fields present, never validated unknown fields absent or nested field names. Mutations 2 and 3 passed undetected.
- **Bucket: C** — Fork-internal testing code (`helpers.ts:197-212`). Rewrote with `assertExactKeys`. Does not affect upstream.
- **Blast radius:** Our characterization suite only.

### DRIFT-03 — P0-09: vacuous gate pattern — two gates passed without exercising their check

- **What:** `gen.mjs --check` always exited 0 regardless of drift. Contract test suite was never wired into `devctl verify` but reported green.
- **Bucket: C** — Fork-internal verification tooling. Both gates are in our `devctl`, not upstream.
- **Blast radius:** Our CI/verify pipeline only.

### DRIFT-04 — Systemic: inconclusive treated as terminal (three occurrences)

- **What:** Three times agents reported verification satisfied based on source inspection after execution was blocked (E5, MUT5, MUT1/2/5 remediation).
- **Bucket: C** — Fork-internal process failure. Rule 5.1 added to `05-AGENT-OPERATIONS.md`. MUT1/2/5 execution still OPEN but is our own audit work.
- **Blast radius:** Our verification process only.

### DRIFT-05 — P0-04 remediation v3: completion reports twice asserted state that did not hold

- **What:** Two artifacts (`x-attachment-shape.yaml`, MUT2 "caught by design") claimed as created/verified did not exist. `devctl doctor` now mechanically asserts file existence.
- **Bucket: C** — Fork-internal process. `devctl doctor` is our tool.
- **Blast radius:** Our verification integrity only.

### DRIFT-06 — P0-10: three contract shapes wrong (contract written from source, not evidence)

- **What:** `contracts/openapi.yaml` was wrong: `/config` marked public (actually 401), `/friends/requests` and `/notifications` described as bare arrays (actually wrapped objects).
- **Bucket: C** — Our contract documentation was wrong. Fixed to match the server's actual behavior. The server code (upstream) was correct all along — we corrected our docs TO upstream reality, not away from it.
- **Blast radius:** Our docs only.

### DRIFT-07 — P0-09 verify routing bug: prior "verify green" reports were vacuous

- **What:** `devctl verify` didn't run the contract suite, which had 14 pre-existing failures. Reports of green were false.
- **Bucket: C** — Our verification wiring. Contract suite wired in P0-08.
- **Blast radius:** Our CI/verify pipeline only.

### DRIFT-08 — Spec assumption about existing OIDC config data was false (DR-002, P0-11)

- **What:** `specs/10-PHASE1-FOUNDATION-AUTH.md` assumed `GET /api/config` returned OIDC fields. Server only returns `{shareBaseUrl, jellyfinUrl}` and is behind SessionGuard. Corrected spec + created DR-002.
- **Bucket: C** — Our spec was wrong about existing upstream behavior. Fixed spec to match reality.
- **Blast radius:** Our spec docs only.

### DRIFT-09 — P0-12 audit: vacuum-gate sweep and trace scoping

- **What:** Four sub-items: (1) tool-output XML tags contaminating committed hooks (4th vacuous gate), (2) trace-in-verify phase scoping contradiction, (3) unexamined environment assumptions, (4) @satisfies annotation enforcement on non-product flows.
- **Bucket: C** — All fork-internal tooling (`devctl`, hooks, trace.mjs, doctor). Hooks were rewritten clean; `devctl doctor` now sweeps for XML contamination; trace scoped to phase; host.json captured.
- **Blast radius:** Our tooling only.

### DRIFT-10 — Inter-session report contradiction: forensic reconciliation

- **What:** Agent report claimed four SHAs existed (`afd3b97`, `4308d8b`, `0ecec8e`, `2b25c6b`). Git proved they don't exist — fabricated history. Forensic evidence documented.
- **Bucket: C** — Agent hallucination. Process fix: completion reports must cite verifiable SHAs. No code divergence.
- **Blast radius:** Our process integrity only.

### DRIFT-11 — P0-16: NFR harness — 5th vacuous gate, and two defects it exposed

- **What:** 11 of 12 NFR scripts were hardcoded `{"status":"blocked"}` stubs. Runner catch block masked errors as "blocked." `devctl nfr` didn't exist. Also: test code tsc hole (any→ApiResponse<any>), selftest corrupted a tracked file, pre-commit lint hook can never pass.
- **Bucket: C** — All fork-internal tooling. Fixed with ARM_AT_PHASE mechanism, real evidence objects, byte-exact selftest backup/restore. The pre-commit lint hook is OPEN (BACKLOG'd) but is our own eslint config gap.
- **Blast radius:** Our tooling only.

### DRIFT-12a — P2 contract drift: gateway-events.yaml shapes wrong

- **What:** `gateway-events.yaml` said `subscribe {channelIds: [...]}` and `message.created d: Message`. Server (`events.gateway.ts`) takes `{channelId}` singular and relay wraps `d: {message}`. Our generated client implemented the wrong contract.
- **Bucket: C** — Our contract was wrong about upstream server behavior. Corrected to match. Upstream's server code was correct all along.
- **Evidence:** Upstream initial commit `311932b` shows `env.d?.channelId` (singular) and `d: { message: event.message }` in relay.
- **Blast radius:** Our contract docs + generated client.

### DRIFT-12b — P2 seed membership was fiction

- **What:** `POST /servers/:id/members` sends an invitation notification, not a direct add. Our seed treated it as direct add and ignored the response. Only owner was ever a member — cross-user actions 403'd.
- **Bucket: C** — Our seed script bug. Rewritten to invite-code accept flow with membership verification.
- **Blast radius:** Our test fixtures only.

### DRIFT-12c — P2 nonce echo fix: server-side nonce propagation (PROPOSE UPSTREAM)

- **What:** Upstream's WS relay path strips nonce from REST-originated messages. `messages.service.ts` publishes `{type: 'MESSAGE_CREATED', message}` to Redis without nonce; `events.gateway.ts` relay sends `d: {message}` without nonce to all subscribers. Clients doing optimistic send via REST get a ghost duplicate because the relayed event can't be matched to the pending message. Our fix: (a) `messages.service.ts:279` publishes nonce to Redis; (b) `events.gateway.ts` adds nonce to BusEvent type and scopes echo to the message author only (`if (event.nonce && client.userId === event.message.authorId)`).
- **Bucket: B** — Genuinely better. Complete, author-scoped, backward-compatible. Upstream already echoes nonce for WS `message.send` to sender; this extends the same guarantee to REST-originated messages for all clients (web, desktop, mobile).
- **Evidence:** Commit `b7319b7`. Compare upstream `311932b` BusEvent (no nonce) + relay (bare `{message}`) vs our version.
- **Blast radius on web/desktop:** Zero. Additive only — the `nonce` field in the envelope is optional. Clients that ignore it are unaffected. Clients that use it (web's optimistic send, if it sends via REST) get ghost-duplicate prevention for free. The server's `subscribe` shape, REST endpoints, and message schema are unchanged.

### DRIFT-12d — P2 nonce echo fix: client-side REST response stamping

- **What:** Mobile client (`ChatPane.tsx:322`) stamps its own nonce onto the REST POST response when server echoes `nonce: null`: `applyCreated({ ...created, nonce: created.nonce ?? nonce })`.
- **Bucket: C** — Mobile-only workaround for REST response lacking nonce. The proper fix is B2 (server-side nonce propagation); this client-side patch is a belt-and-suspenders for our specific mobile implementation.
- **Blast radius:** Mobile client only.

### DRIFT-12e — P2 DL-P1-01 cleartext + seed.mjs parse fix

- **What:** Release builds blocked cleartext HTTP (fixed via expo-build-properties, BACKLOG'd for Phase 8). Seed.mjs had duplicate const.
- **Bucket: C** — Fork-internal: Android release config + seed script fix.
- **Blast radius:** Our mobile build config + seed tooling only.

### DRIFT-13 — Overnight autonomous run: four defects, three in the verifier

- **What:** Defect 1 (CHAR_WS_BASE omitted — gate nearly rejected a good branch), Defect 2 (tsc exit code captured from `head`, not `tsc` — gate reported rc=0 over failing typecheck), Defect 3 (Jest green over code that doesn't compile — duplicate `applyUpdated`), Defect 4 (teardown instruction made branches ungateable). Also: architect process drift (phase gating violated, partial test run reported as full).
- **Bucket: C** — All fork-internal verifier defects + architect process. All FIXED.
- **Blast radius:** Our gating/verification pipeline only.

### DRIFT-14 — DD-018: Permission enum has three sources of truth; codegen truncates it

- **What:** `gen.mjs` emitted only bits 0-7, dropping BAN_MEMBERS (8), SEND_MESSAGES (9), READ_MESSAGES (10). Codegen drift gate was vacuous. FR-ROLE-002 deviation: no shared permission lib (no npm workspaces); S1 created `apps/mobile/src/permissions.ts` as mirror of API's.
- **Bucket: C** — Our codegen bug + fork-internal design compromise. Fix dispatched (CG2). FR-ROLE-002 compensating control (codegen from single contract + test asserting bit agreement) achieves intent without restructuring both apps into workspaces.
- **Blast radius:** Our codegen + mobile client only.

### DRIFT-15 — DD-019: Stale fixture ids in fixture-ids.json

- **What:** `tools/seed/fixture-ids.json` records ids from a seed run that doesn't match the running database. `p2-16-around` and `p7-05-message-search` suites get 404s.
- **Bucket: C** — Our seed data management. Captured-id artifacts banned as oracles per adjudication.
- **Blast radius:** Our test fixtures only.

### DRIFT-16 — DD-020: A test that cannot fail was produced while fixing DD-019

- **What:** Fix for DD-019 probed expected search results from the search endpoint itself — asserting search agrees with itself. Would pass even if search returned wrong messages or empty set.
- **Bucket: C** — Our test quality. Rejected, redispatched with independence requirement.
- **Blast radius:** Our test suite only.

### DRIFT-17 — DD-021: Agent L1 edited apps/api/src/auth/ despite explicit prohibition

- **What:** Work order said "Do NOT touch apps/api/src/auth/." Agent edited 5 files. Changes were cosmetic and proven behaviour-preserving (tsc green, 11 suites / 89 tests green against own API).
- **Bucket: C** — Process violation. Accepted (reverting cosmetic renames adds churn for no safety gain). Boundary violation recorded.
- **Blast radius:** Our process discipline only.

### DRIFT-18 — DD-022: Two models exist in schema.prisma with no migration

- **What:** `NotificationSetting` and `DeviceToken` are in schema.prisma but appear in zero migration files. Fresh `prisma migrate deploy` would not create these tables.
- **Bucket: C** — Our fork's net-new models (for notifications, which upstream doesn't have). The bug is that we added them without proper migrations. Fix dispatched. Upstream has neither model, so no divergence to reconcile.
- **Blast radius:** Our deployment correctness only.

### DRIFT-19 — DD-023: Three device-found UI defects (manual pass, physical hardware)

- **What:** (1a) Composer sits behind system nav bar — `react-native-safe-area-context` not a dependency. (1b) Composer doesn't lift with keyboard — `KeyboardAvoidingView` inert on Android. (2) Drawer is three columns vs Discord's two.
- **Bucket: C** — Mobile-only layout/inset/keyboard bugs. Android-specific. Zero upstream implication — web/desktop don't use React Native, safe-area-context, or Android nav bars.
- **Blast radius:** Mobile Android only.

### DRIFT-20 — Push client uses expo-notifications instead of @react-native-firebase/messaging + notifee (FR-NOTIF-002)

- **What:** Spec called for Firebase+notifee. We use `expo-notifications ~57.0.7` — same FCM transport, avoids pulling full Firebase SDK into the Expo-managed build.
- **Bucket: C** — Mobile-only platform choice. Expo SDK 57 app built via `expo prebuild`. Backend-facing contract (`POST/DELETE /api/devices`) unchanged. Upstream web/desktop don't use push notifications at all (and wouldn't use either library).
- **Blast radius:** Mobile only. iOS path is zero-config when unblocked.
- **Evidence:** `apps/mobile/package.json` dependency. `specs/17-PHASE8-NOTIFICATIONS-RELEASE.md §P8-02` vs actual.

---

## Supplemental entries (code divergences without DRIFT-LOG entries)

These are verified-real divergences discovered in `apps/api/src/` that the DRIFT-LOG doesn't yet record. They MUST get DRIFT-LOG entries before the merge.

### B1 — Granular guild-structure realtime events (FR-SRV-009)

- **What:** Added 10 guild-structure event types to `events.gateway.ts` BusEvent union: `CHANNEL_CREATED`, `CHANNEL_DELETED`, `ROLE_CREATED`, `ROLE_UPDATED`, `ROLE_DELETED`, `MEMBER_JOINED`, `MEMBER_LEFT`, `MEMBER_KICKED`, `SERVER_UPDATED`, `SERVER_DELETED`. Added `serverIds` membership tracking per connection (loaded from Prisma at connect, updated dynamically). Relay logic delivers server-scoped events to all members of that server.
- **Bucket: B** — Upstream only emits coarse `notify` for guild changes; clients must refetch-all. Our events are additive, scoped, and backward-compatible. Web/desktop clients ignore unknown ops silently.
- **Evidence:** Commit `038eda0` (2026-07-25). Upstream initial commit `311932b` has zero guild-structure events. Our gateway now relays `channel.created`, `channel.deleted`, `role.*`, `member.*`, `server.*` with proper audience scoping.
- **Blast radius on web/desktop:** Additive only. New WS op codes are ignored by clients that don't handle them. No existing op codes changed. Membership tracking is connection-local.

### B3 — Channel permission overwrites (FR-ROLE-003)

- **What:** Added `ChannelOverwrite` Prisma model + migration, `OverwritesService` (CRUD + upsert on unique constraint), REST endpoints (`GET/PUT/DELETE /servers/:id/channels/:cid/overwrites`), and a pure effective-permission resolver (`permissions.ts`) implementing Discord precedence order: Tier 0 (@everyone base) → Tier 1 (role overwrites, deny beats allow) → Tier 2 (member overwrites, deny beats allow) → Bypass (owner/ADMINISTRATOR). 26 golden-table tests pass. Overwrites feed into real permission checks — an overwrite changes what a user can actually do, not just what's stored.
- **Bucket: B** — Upstream has no permission overwrites (MASTER-SPEC G5: "server has no support"). Our implementation is complete, tested, and follows Discord's documented precedence rules. The migration is additive (new table, no schema changes to existing models).
- **Evidence:** Commit `c497ef3` (2026-07-25). Migration at `apps/api/prisma/migrations/20260725153850_add_channel_overwrites/`. Resolver at `apps/api/src/permissions/permissions.ts:48-129`. Golden tests at `apps/api/src/permissions/permissions.golden.spec.ts` (26/26 pass).
- **Blast radius on web/desktop:** Additive. New endpoints, new WS events (if overwrite changes emit). Existing channel/message behavior is unchanged when no overwrites exist. Web client would need UI to edit overwrites to use the feature, but the server-side infrastructure imposes zero cost if unused.

---

## What D1 (E-01) needs from the owner

`docs/escalations/E-01-markdown-web-parity.md` documents that `apps/web/src/App.tsx` `renderContent` (line 752) handles only URL detection and @mention highlighting — zero markdown. FR-MSG-007 lists 10+ markdown constructs and says "matches web client semantics." Mobile implements a full Discord-flavored markdown parser (47 tests). The three options are mutually exclusive and each has downstream consequences for the Phase 2 signoff. This must be resolved before signing off Phase 2.
