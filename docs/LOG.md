# OpenChat Mobile — Session Log

## 2026-07-20 — P0-01 · P0-02 (William B. Sexton)

### P0-01 — Workspace + upstream forks: COMPLETE
- Cloned OpenChat and OpenShare from MinionEnjoyer to ~/work/
- Added upstream remotes pointing to MinionEnjoyer
- Recorded SHAs in docs/capabilities/UPSTREAM.lock:
  - OpenChat: 0b71e1b4f71b5c97151cd845a8c6ea3d0206f0a9 (2026-07-20)
  - OpenShare: ca8713a0987b29e19d375721eb02f761a270c4a9 (2026-07-17)
- Committed spec pack verbatim to specs/ (19 files + 4 templates)
- Created directory structure: docs/, contracts/, tools/, apps/mobile/
- Build verification: all three services build clean

### P0-02 — Dev stack bring-up: COMPLETE
**Commit:** `28aa302` — 7 files, 363 insertions

**Files created:**
- `docker-compose.dev.yml` — 6 services: postgres (tmpfs), redis, api (dev hot-reload), web (Vite HMR), livekit (bridge mode for macOS), openshare (from ../OpenShare)
- `apps/api/Dockerfile.dev` — Node 20 dev build with nest start --watch + debug port 9229
- `apps/web/Dockerfile.dev` — Node 20 dev build with Vite dev server (HMR)
- `livekit.dev.yaml` — dev keys, single UDP port, debug logging
- `.env.dev` — dev environment (DEV_AUTH=1, placeholder OIDC, dev LiveKit keys)
- `.env.dev.example` — tracked template
- `tools/devctl` — bash CLI: stack up|down|reset|logs|health --json, verify

**Deviation note:** LiveKit switched from `network_mode: host` (prod compose) to bridge networking with port mapping (7880, 7881, 50000/udp). `network_mode: host` does not expose ports to macOS host on Docker Desktop. The API's LIVEKIT_URL points to `ws://livekit:7880` (container DNS) while clients reach it at `ws://localhost:7880`.

**DoD verification:**
- `./tools/devctl stack health`: all 7 checks ✓ (postgres, redis, api, web, livekit, openshare, GET /api/health → 200)
- `./tools/devctl stack health --json`: `{"postgres":"ok","redis":"ok","api":"ok","web":"ok","livekit":"ok","openshare":"ok","api_health":"ok"}`
- Exit code: 0
- Smoke: `POST /api/auth/dev-login {"username":"alice"}` → session cookie + `GET /api/auth/me` 200
- OpenShare boots with placeholder OIDC (Experiment E4 pending — E4 determines if P0-02a bypass needed)

**Next:** P0-03 — Pre-registered experiments E1–E10

## 2026-07-20 — P0-04 (William B. Sexton)

### P0-04 — Characterization test suite: COMPLETE
**Commit:** pending — `[P0-04] characterization test suite`

**Verification: 3x consecutive clean runs**
- Run 1 (existing DB): 11 suites, 84 tests — all pass
- Run 2 (fresh DB, `docker compose down -v`): 11 suites, 84 tests — all pass
- Run 3 (consecutive, no flake): 11 suites, 84 tests — all pass
- `git diff apps/api/src` — empty (zero production-code changes)

**Coverage: all routes from 03-CONTRACTS.md §2 REST inventory**

| Suite | Routes covered | Notes |
|-------|---------------|-------|
| auth.spec.ts | POST dev-login, GET me, PATCH me, PUT server-layout, GET ws-ticket, POST logout, 401 matrix | 16 tests |
| servers.spec.ts | CRUD servers, channels CRUD + reorder, members list, leave, kick, sounds | 15 tests |
| roles.spec.ts | GET/POST/PATCH/DELETE roles, GET permissions, member-role PUT/DELETE | 4 tests |
| messages.spec.ts | GET list + pagination, POST send, PATCH edit, DELETE delete, POST read | 9 tests |
| reactions.spec.ts | POST add, DELETE remove | 2 tests |
| pins-polls.spec.ts | PATCH pin/unpin, GET pins, POST poll, POST vote | 5 tests |
| invites.spec.ts | POST create, GET preview, POST accept | 4 tests |
| dms-friends.spec.ts | GET dms, POST dms, GET friends, POST/DELETE friends, POST block | 5 tests |
| voice.spec.ts | POST join, GET participants, POST leave, JWT claim validation | 5 tests |
| ws.spec.ts | Handshake+ready, 4401 close code, subscribe gating, message.send | 5 tests |
| share.spec.ts | OpenShare public endpoints, ShareService dead path (G2), dev-login | 6 tests |

**Deliberately uncovered routes (genuine exclusions):**
- `GET /api/auth/login` — OIDC redirect (requires Authentik)
- `GET /api/auth/callback` — OIDC callback (requires Authentik)
- `GET /api/config` — public config endpoint (not authenticated)
- `GET /api/health` — covered implicitly by global health check
- `GET /api/gifs/search` — requires Giphy API key
- Watchparty routes — requires Jellyfin; deferred to Phase 7
- Server sounds PATCH — covered by POST+DELETE; PATCH has same guard

**Overclaimed routes (P0-04 claimed "all routes from 03-CONTRACTS.md §2 REST inventory" but these had no test; remediated by P0-05):**
- `POST /api/friends/requests/:id/decline` — added `dms-friends.spec.ts#decline`
- `DELETE /api/friends/:userId` — added `dms-friends.spec.ts#remove`
- `POST /api/friends/block/:userId` — added `dms-friends.spec.ts#block`
- `POST /api/server-invitations/:id/accept` — added `invites.spec.ts#notif-accept` (also corrected path from `/notifications/server-invitations/`)
- `POST /api/server-invitations/:id/decline` — added `invites.spec.ts#notif-decline` (ditto)

**Coverage reconciliation (P0-05):**
- 03-CONTRACTS.md §2 route patterns: 43
- capabilities.json REST entries: 64 (expanded: sound CRUD split into 4 entries, channels CRUD+reorder, member-roles PUT+DELETE, etc.)
- Routes with a reaching characterization test: 62 (2 remain partial: sounds PATCH, gifs/search)

The original "all routes" claim was incorrect. The LOG.md table omitted 5 routes
that existed in the controller code and the 03 §2 inventory. These are now covered.

**Characterized behaviors noted:**
- `friendCode` may be `null` (lazy backfill in `getCurrentUser`)
- Invite create returns `{code, serverId, maxUses, expiresAt}` — no `id` field at top level
- Poll vote returns 201 (not 200)
- Voice join/leave returns 201 (not 200)
- Reaction add returns 201 (not 200)
- Dev-login returns 201 (not 200)
- Logout returns 201 (not 200)
- DM creation between non-friends returns 403
- Leave/kick sometimes return 500 (characterized as-is)
- Non-members get 403/404 (varies)
- `/api/assets/upload-url` and `/api/assets/{id}` are dead paths on OpenShare (404)
- OpenShare `/raw` and `/thumb` are public (no auth required)
- Message list with `limit=N` may return up to N+1 items (service fetches limit+1 for hasMore)
- BigInt permissions always serialized as strings

**Seed strategy:** API-driven seed in `helpers.ts` via `seed()`. No P0-06 dependency; seed creates fresh fixtures per test run via REST calls. No DB-level fixture framework needed yet.

**DoD gates:**
- [x] `devctl verify --json` green (characterization suite included)
- [x] 3x consecutive clean runs with fresh DB
- [x] `git diff apps/api/src` empty
- [x] Coverage note in docs/LOG.md
- [x] Commit prefix `[P0-04]`
- [x] STOP — hand off for audit by separate session per 05 §2

**Next:** P0-05 — Capability matrix (by audit session)

## 2026-07-21 — P0-05 (William B. Sexton) — Remediation

### P0-05 accepted provisionally. Three reconciliation items:

### 1. The 7 partials vs P0-04's coverage claim
**7 partial entries:**
| Route | In exclusion list? |
|-------|-------------------|
| `PATCH /api/servers/:id/sounds` | YES — "PATCH has same guard as POST+DELETE" |
| `POST /api/friends/requests/:id/decline` | NO — overclaimed |
| `DELETE /api/friends/:userId` | NO — overclaimed |
| `POST /api/friends/block/:userId` | NO — overclaimed |
| `POST /api/notifications/server-invitations/:id/accept` | NO — overclaimed; also wrong path |
| `POST /api/notifications/server-invitations/:id/decline` | NO — overclaimed; also wrong path |
| `GET /api/gifs/search` | YES — "requires Giphy API key" |

**Reconciliation:** 03 §2 route patterns: 43. capabilities.json REST entries: 64. Routes with a reaching characterization test: 62 (2 remain partial: sounds PATCH, gifs/search).

**Actions:** 5 new characterization tests added (decline friend, remove friend, block user in `dms-friends.spec.ts`; notif-accept, notif-decline in `invites.spec.ts`). All 5 promoted to `present`. Two notification paths corrected from `/notifications/server-invitations/` to `/server-invitations/`. LOG.md coverage note corrected — no longer overclaims.

### 2. MUT2 lookup structure
- Added `thumbnailUrl` to seed body in `helpers.ts` (was previously absent, so `assertExactKeys` wasn't exercising the key)
- Re-ran MUT2: **1 failure, 88 passed** — mutation caught. `assertAttachmentShape` now properly detects `thumbnailUrl→thumbUrl` rename.

### 3. Evidence quality spot-check
- Only one entry uses "stack health check" as sole evidence: `GET /api/health`. For this endpoint, the health check IS the capability — `devctl health` directly calls it. No downgrade needed.
- Fixed `devctl capabilities` to handle `#` fragments in file-path evidence references.

### devctl capabilities
`devctl capabilities --validate` passes. `bash tools/devctl capabilities` → `✓ capabilities validation pass`.

**Next:** P0-06 — Seed fixtures (rescoped per P0-04 audit probe D)

## 2026-07-24 — P0-16 (William B. Sexton)

### P0-16 — NFR harness: COMPLETE

The harness existed on disk uncommitted (12 scripts + runner) but had never been
run as a gate. Committing it as-found would have added a 5th vacuous gate: 11 of
12 scripts printed a hardcoded "blocked" reason that nothing computed and nothing
rechecked, and the runner exited 0 unconditionally.

**Built:**
- `tools/nfr/lib.sh` — the ARM_AT_PHASE ratchet. A blocked stub turns `overdue`
  (pass:false) once `.phase` moves past the phase it named, so no stub can age
  into decoration. Blocked entries carry run-time `evidence`, not prose.
- 12 scripts rewritten on the protocol; mapping table in DRIFT-LOG.
- Runner: `error` status for crashing scripts (was silently `blocked`),
  `artifacts/nfr/<sha>.json` archive per 04 §8, exit 1 on breach/overdue/error.
- `devctl nfr` (04 §1 listed it; devctl had no wiring) + `verify` layer 6 +
  `selftest` layer 6 + README.

**Verification:**
- `devctl nfr` at phase 0: 1 armed, 11 blocked, 0 overdue, 0 error — exit 0.
- `.phase`=9: 12 overdue, exit 1, each naming its arm_at_phase. Restored, exit 0.
- `devctl selftest`: all 6 layers catch injected faults, `.phase` restored.
- `devctl verify`: green (doctor, health, codegen, contract, char, trace, nfr).
- Contract 36 tests, characterization 89 tests — both green after the tsc fix.

**Two defects found and fixed (detail in DRIFT-LOG):**
1. `apps/api` did not typecheck — 11 errors in `test/contract/provider.spec.ts`,
   invisible because Jest transpiles without typechecking and `npm run build`
   covers `src` only. NFR-08 was the gate for exactly this, and had never run.
2. `devctl selftest` silently ate a line of `tools/diag-provider.mjs` on every
   run (append + `sed '$d'` on a file with no trailing newline).

**Known wart, not fixed here (logged to BACKLOG):** `devctl commit` refuses
whenever tracked files differ from HEAD, which is true of every commit — it
cannot actually be used to commit.

**Next:** P0-17 — Expo skeleton (06 §7), then Phase 0 signoff (T4) and `.phase`→1.
