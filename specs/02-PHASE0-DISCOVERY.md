# 02 — PHASE 0: Discovery, Characterization & Capability Matrix

Goal: turn the static ground truth in `00-MASTER-SPEC.md §0.3` into **runtime-verified** facts,
encode them as executable characterization tests, and produce the capability matrix that every
later phase cites. Nothing in Phases 1+ may rely on an assumption this phase didn't confirm.

Method: every unknown is resolved by a **pre-registered experiment** — hypothesis and expected
observation written BEFORE running it, one variable at a time, results recorded. This is the
scientific-method discipline from `05-AGENT-OPERATIONS.md §3` applied to discovery.

## P0-01 · Workspace + upstream forks
- Fork both repos; clone per `00 §0.4`; add `upstream` remotes; record base SHAs in
  `docs/capabilities/UPSTREAM.lock` (`{repo, remote, sha, date}` JSON). All later diffs are
  measured against these SHAs.
- Commit this spec pack verbatim to `OpenChat/specs/`.
- DoD: both repos build clean at base SHA (`npm ci && npm run build` in `apps/api` and
  `apps/web`; `pip install -r requirements.txt && python -c "import main"` in OpenShare via
  Docker if host deps missing).

## P0-02 · Dev stack bring-up (no Authentik dependency)
Create `docker-compose.dev.yml` in OpenChat root, additive, never touching prod compose:
- Services: `postgres` (16-alpine, tmpfs volume for test resets), `redis` (7-alpine), `api`
  (built from `apps/api`, env: `NODE_ENV=development`, `DEV_AUTH=1`, `SESSION_SECRET=dev`,
  `SHARE_BASE_URL=http://openshare:8800`, `SHARE_API_KEY=dev-share-key`, LiveKit dev keys),
  `web` (Vite dev or nginx build), `livekit` (dev config, single UDP port), `openshare`
  (built from `../OpenShare`, `ALLOWED_ORIGINS` includes web origin; OIDC vars set to
  placeholder — Experiment E4 determines whether OpenShare boots without a reachable IdP; if
  not, add a guarded `DEV_AUTH` bypass to OpenShare mirroring OpenChat's, as pre-approved
  backend change P0-02a).
- `tools/devctl stack up|down|reset|logs|health --json` wraps compose (04 §3).
- DoD: `devctl stack health --json` → every service `"ok"`; `GET /api/health` 200.

## P0-03 · Pre-registered experiments (run each; append results to `docs/capabilities/EXPERIMENTS.md` using T1 format)

| # | Question | Hypothesis | Procedure (exact) | Decides |
|---|----------|------------|-------------------|---------|
| E1 | Does dev-login yield a usable session for ALL guarded routes? | Yes; sets `session.userId` cookie honored by SessionGuard | `curl -c jar -X POST :3001/api/auth/dev-login -d '{"username":"alice"}' -H 'content-type: application/json'` then cookie-authed `GET /api/auth/me`, `GET /api/servers` | Test-auth strategy for characterization suite |
| E2 | Exact WS handshake + `ready` payload + subscribe semantics | Matches `00 §0.3`; `servers:[]` hardcoded; events only for subscribed channelIds except presence | Node script `tools/probe/ws-probe.mjs`: mint ws-ticket, connect, log 60s of frames while a second dev user posts via REST | `contracts/gateway-events.yaml` v1 truth |
| E3 | Which REST mutations emit which bus events? | Only messages/typing/presence/watchparty/notify/mention/call.ring; server/role/channel CRUD emit at most NOTIFY | Scripted matrix: for each mutation in `03 §2`, fire it while ws-probe listens; record op(s) observed | Per-phase realtime gap list (FR-SRV-009 scope) |
| E4 | Does OpenShare boot + serve `/upload` with placeholder OIDC and no IdP? | Boot yes; `/upload` 401/redirect without session | compose up openshare alone; `curl -F file=@fixtures/1px.png :8800/upload` | Whether P0-02a bypass is needed for test auth |
| E5 | OpenShare `/upload` response schema + dedup + `source=chat` behavior | `{saved:[{id, media_type, …}], rejected:[…]}`; same-hash second upload returns same id | Authenticated double-upload of identical file; diff responses | `contracts/share-assets.yaml` current-state section |
| E6 | Message list pagination exactness | `?before=<msgId>&limit=n` returns n older msgs, newest-first or oldest-first? (record actual) | Seed 120 msgs via REST loop; walk cursor to exhaustion; assert no gap/dupe by id set | Client pagination adapter in 06 §5 |
| E7 | Reaction/pin/poll/read events on the wire | Reactions/pins arrive as `message.updated` full message; read state has NO event | Trigger each while ws-probe listens | FR-MSG-006/010/011 client sync strategy |
| E8 | Voice join contract | `POST /api/voice/:id/join` → `{token, url?}` LiveKit access token; participants endpoint shape | Call with dev user against dev LiveKit; decode JWT claims | `contracts/openapi.yaml` voice section; Phase 6 |
| E9 | Attachment shape on messages | `attachments:[{shareAssetId, url, thumbnailUrl, mimeType?, …}]` per web `lib/share.ts` | Post message with fabricated attachment refs via REST as web does; read back | MED data model; media proxy URL-rewrite rules |
| E10 | CORS/session behavior for non-browser clients | Bearer absent today: any request without cookie → 401 everywhere | Matrix of curl calls | Confirms G1 scope (no hidden token path exists) |

Rules: if an experiment falsifies a hypothesis, update `00 §0.3` ground truth (PR titled
`[P0] ground-truth correction: …`), adjust the named downstream decision, and record a
Decision Record. Do NOT silently absorb surprises.

## P0-04 · Characterization test suite (freeze current behavior)
- Location: `apps/api/test/characterization/*.spec.ts` (Jest, runs against the dev stack via
  `devctl stack reset && npm run test:char`). These tests describe what the platform DOES
  today (from E1–E10), not what we wish. They are the regression net under every backend
  change; a characterization test may only change in a commit that intentionally changes the
  behavior it pins, with the spec work-item ID in the commit message.
- Minimum coverage: auth/dev-login+me · servers/channels/roles CRUD happy paths + one
  permission-denied case each · invites lifecycle · messages full lifecycle (send/edit/delete/
  react/pin/poll/read + pagination walk) · friends state machine · dms create/list · ws
  connect/subscribe/receive for every op observed in E2/E3/E7 · voice join token issuance ·
  OpenShare upload/raw/thumb (session-authed per E4 outcome).
- Every test carries `// @characterizes <endpoint-or-op>`; `devctl trace` reports the
  characterization inventory alongside FR trace.

## P0-05 · Capability matrix
Produce `docs/capabilities/capabilities.json`:
```json
{ "verifiedAt": "<iso>", "upstream": {"openchat": "<sha>", "openshare": "<sha>"},
  "rest": [ {"method":"GET","path":"/api/auth/me","auth":"session","status":"present","char":"auth.spec.ts#me"} ],
  "ws":   [ {"op":"message.created","dir":"s2c","status":"present","char":"ws.spec.ts#created"} ],
  "gaps": [ {"id":"G1","confirmedBy":"E10","closedBy":"10-PHASE1"} ] }
```
Every REST route in `03 §2`, every WS op, every gap G1–G5: `present | absent | partial`, each
with the experiment/char-test that proves it. `devctl trace` fails Phase 0 signoff if any
entry lacks evidence.

## P0-06 · Seed fixtures (RESCOPED per P0-04 audit probe D)
**Deviation origin:** P0-04 chose API-driven fixtures for characterization tests, obsoleting
P0-06's original role as their supplier. P0-06 is now rescoped to the remaining deliverables.

`tools/seed/seed.mjs` (idempotent, `devctl stack seed`): users alice/bob/carol/dave (dev-login),
server "Fixture Guild" (3 categories, 6 text + 2 voice channels), roles Admin/Mod/Member with
known bitfields, 1000-message channel `#volume` (deterministic content, seeded RNG), one DM,
one group DM, pending friend request carol→dave, 3 uploaded images (E4-dependent auth), one
poll, 5 pins.

Remaining jobs (rescoped from original P0-06):
- The dev/demo seed used by Maestro E2E and manual demo scripts from Phase 1 onward.
- The 1000-message #volume channel required by E6 and the NFR-02 scroll baseline (flagged as homeless by P0-04 audit).
- `tools/seed/fixture-ids.json` emitted with stable KEYS (semantic names → IDs), regenerated per seed run, as single source of truth. IDs are NOT byte-stable across DB resets (API generates them); the key set and file structure are what's stable.
- Idempotent and fast: re-running against a seeded DB must converge, not duplicate. Assert with a test that runs the seed twice.

What P0-04's API-driven helpers already cover (NOT duplicated here): alice/bob/carol dev-login,
basic server creation, 2 channels, Admin/Mod roles, 5 messages. P0-06 extends this with dave,
the full 8-channel layout, roles with known bitfields, friendships, DMs, and #volume.

## Phase 0 signoff gates
`devctl verify` green (lint/build/char-tests) · all E1–E10 recorded with observed results ·
capabilities.json complete + evidence-linked · seed idempotency proven (`seed && seed` → same
fixture-ids.json) · `T4` signoff committed. Out of scope for this phase: any mobile code, any
backend behavior change except pre-approved P0-02a.
