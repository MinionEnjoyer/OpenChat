# 00 — MASTER SPEC: OpenChat Mobile (Discord-Parity React Native Client)

Status: FROZEN v1.0 · Audience: an autonomous Sonnet-class coding agent · Human role: product owner / macro-validation only.

## 0.1 Mission

Deliver a fully functional cross-platform (Android + iOS) React Native app with Discord feature
parity (as defined in `01-REQUIREMENTS.md`, which is the ONLY authoritative definition of
"parity"), built on the existing **OpenChat** platform (NestJS/Prisma/Postgres/Redis/LiveKit,
repo `MinionEnjoyer/OpenChat`) and **OpenShare** file service (FastAPI/SQLite, repo
`MinionEnjoyer/OpenShare`). Both upstream codebases MAY be modified where these specs say so.

This spec pack is the system, not a suggestion. It implements the operating model of
"Engineering Discipline at AI Velocity": test design lives inside every design artifact
(V-model left side), a deterministic verification stack gates every change (trust pyramid),
work proceeds in a Generate → Verify → Audit → Refactor cadence, and inference is reserved for
judgment — everything mechanical is a script.

## 0.2 Non-negotiable operating rules (read before any work)

1. **One work item per session.** Work items are the numbered units inside phase specs
   (e.g. `P2-03`). Never start a second work item before the first reaches Definition of Done.
2. **No code change without a failing signal or a spec line.** Every diff traces to a work
   item ID and ≥1 requirement ID (`FR-*`/`NFR-*`). Commit messages: `[P2-03] <imperative summary>`.
3. **Verification is a command, not an opinion.** A work item is done only when
   `./tools/devctl verify --json` reports `"status":"pass"` (see `04-TEST-AND-VERIFICATION.md`).
4. **Debugging follows the scientific method.** Any fix for unexpected behavior requires a
   Debug Log entry (hypothesis → prediction → single experiment → result) per
   `05-AGENT-OPERATIONS.md` and `templates/T1-DEBUG-LOG.md`. No shotgun edits.
5. **Every work item ends with an Audit pass** (separate context/session) using
   `templates/T2-AUDIT-CHECKLIST.md`. Drift found is logged, not silently fixed.
6. **Out of Scope lists are binding.** If a tempting improvement is out of scope, write it to
   `docs/BACKLOG.md` and move on. Kitchen-sink generation is a defect.
7. **Deviations require a Decision Record** (`templates/T3-DECISION-RECORD.md`) BEFORE the
   deviating code is written. Allowed deviation triggers: a named default library is
   broken/unavailable at pinned major version, a Phase 0 experiment falsifies a stated
   assumption, or a security problem. Preference is never a trigger.
8. **Escalate instead of thrash.** Stop conditions in `05-AGENT-OPERATIONS.md` §5. When
   stopped, write `docs/escalations/E-<n>.md` and halt the work item. The verification stack
   protects the codebase; the stop rule protects the schedule.
9. **Never commit secrets.** `.env` files and `livekit.yaml` are gitignored upstream; keep it
   that way. Run the existing `scripts/check-secrets.sh` in pre-push (already present upstream).
10. **Backward compatibility with the existing web client is a standing requirement** for all
    backend changes unless a work item explicitly says otherwise. The web app is the
    reference implementation and regression canary.

## 0.3 Ground truth (verified 2026-07-20 by static inspection; re-verify at runtime in Phase 0)

### OpenChat
- Monorepo: `apps/api` (NestJS 10, Node 20, CommonJS, Prisma 5, Postgres 16, Redis 7/ioredis,
  raw `ws` gateway, `livekit-server-sdk`, Zod pipes, pino) and `apps/web` (React 18 + Vite +
  Zustand + TanStack Query + `livekit-client` + emoji-mart). Compose services: `postgres`,
  `redis`, `api`, `web` (nginx), `livekit`.
- HTTP: global prefix `/api`; CORS locked to `WEB_ORIGIN` with `credentials:true`; helmet;
  `trust proxy`; cookie session `chat.sid` (express-session + connect-redis, 7-day, SameSite=Lax).
- Auth: Authentik OIDC Code+PKCE handled **server-side**; session cookie is the only prod
  credential. `GET /api/auth/ws-ticket` mints a WS ticket. `POST /api/auth/dev-login`
  (body `{username}`) exists, 404 unless `DEV_AUTH=1` and `NODE_ENV!=production`.
- WS: `GET /ws?ticket=<t>` upgrade on the same HTTP server; JSON envelope `{op, d, id?}`;
  server ws-pings every 30s. Full protocol inventory in `03-CONTRACTS.md`.
- Permissions: 8-flag BigInt bitfield on `Role.permissions` (`ADMINISTRATOR`, `MANAGE_SERVER`,
  `MANAGE_CHANNELS`, `MANAGE_ROLES`, `MANAGE_MEMBERS`, `CREATE_INVITE`, `MANAGE_MESSAGES`,
  `MENTION_EVERYONE`). Owner ⇒ ADMINISTRATOR. **No channel-level overwrites today.**
- Schema (Prisma): User, Server, ServerMember, Role, Category, Channel
  (`TEXT|VOICE|ANNOUNCEMENT|DM|GROUP_DM`; `parentId` thread scaffold exists, unused), Message
  (soft-delete, `replyToId`, `pinned`), MessageAttachment, Reaction, Poll/PollOption/PollVote,
  ReadState, Invite, ServerInvitation, ServerSound, VoiceSession, WatchParty, AuditLog,
  Friendship, ChannelRecipient.
- Feature surface already present server-side: servers/channels/categories reorder, roles,
  invites (code + direct server-invitations), messages (cursor pagination `?before&limit`,
  optimistic `nonce`, edit/delete/reactions/pins/polls/read), DMs + group DMs, friends
  (+block), notifications, voice join/leave/participants (LiveKit token), watch parties
  (Jellyfin), GIF search (Giphy), per-user `serverLayout` JSON (server rail folders/order).

### OpenShare
- FastAPI + SQLite + Authlib OIDC; **cookie-session auth only**; CORS `ALLOWED_ORIGINS` with
  credentials. `POST /upload` (multipart, field `source=chat` routes to a "Chat" folder;
  response `{saved:[{id, media_type, …}], rejected:[{name, reason}]}`), `GET /raw/{id}`,
  `GET /raw/{id}/{filename}`, `GET /thumb/{id}`, viewer pages `/(i|v|d|t|m|a)/{id}`, folders,
  search, bulk ops. Content-hash dedup. Audio types accepted as of `ca8713a`.

### Verified integration gaps (these are facts, not guesses — the specs close them)
- **G1 · Native auth**: cookie-session + server-side OIDC redirect flow is unusable as-is by a
  native app. Fix specified in `10-PHASE1` (token endpoint + bearer guard, additive).
- **G2 · Asset API mismatch**: `apps/api/src/share/share.service.ts` calls
  `POST {SHARE_BASE_URL}/api/assets/upload-url` and `GET /api/assets/{id}` with
  `Authorization: Bearer SHARE_API_KEY` — **no such routes exist in OpenShare**. Dead code;
  the web client instead uploads browser→OpenShare `/upload` with the user's Share session
  cookie. Fix specified in `14-PHASE5` (implement a real asset API in OpenShare; repoint
  ShareService at it).
- **G3 · Media auth**: `/raw` and `/thumb` require an OpenShare session cookie ⇒ a native app
  cannot render any attachment/avatar today. Fix: authenticated media proxy in OpenChat
  (`14-PHASE5`).
- **G4 · Realtime coverage**: gateway relays only message/typing/presence/watchparty/notify/
  mention/call.ring. Guild/channel/role/member/read-state changes have no granular events
  (clients refetch on `notify`). Additive events specified per phase.
- **G5 · Parity feature gaps** (server has no support): channel permission overwrites, ban/
  timeout (kick only), threads (schema only), message search, slowmode, per-server nicknames,
  @role mentions, custom emoji, push notifications, audit-log read API. Specified in
  `16-PHASE7` and `17-PHASE8`.

## 0.4 Workspace layout (create exactly this)

```
~/work/
  OpenChat/                # fork of MinionEnjoyer/OpenChat  (git remote: origin=your fork, upstream=MinionEnjoyer)
    apps/api               # existing — modified per phase specs
    apps/web               # existing — DO NOT break; canary only
    apps/mobile/           # NEW — the React Native app (Expo prebuild workflow)
    contracts/             # NEW — openapi.yaml, gateway-events.yaml, share-assets.yaml (03)
    tools/                 # NEW — devctl + scripts (04)
    specs/                 # THIS PACK, committed verbatim
    docs/                  # NEW working docs: BACKLOG.md, DRIFT-LOG.md, decisions/, debug-logs/, escalations/, capabilities/
    docker-compose.dev.yml # NEW — dev/test stack incl. sibling OpenShare (04 §2)
  OpenShare/               # fork of MinionEnjoyer/OpenShare (modified in Phase 5)
```

All agent-facing documentation lives in-repo, versioned with the code it describes.
Optimize legibility for the agent: JSON-out CLIs, structured logs, screenshots for GUI state.

## 0.5 Execution order and gating

Specs execute strictly in order; a phase starts only after the previous phase's signoff
(`templates/T4-PHASE-SIGNOFF.md`) is committed to `docs/signoffs/`.

| # | Spec | Produces |
|---|------|----------|
| 02 | Phase 0 — Discovery & Characterization | running dev stack, `docs/capabilities/capabilities.json`, characterization tests, confirmed/updated contracts |
| 03 | Contracts | frozen machine-readable API + WS + asset contracts, generated TS client/types |
| 04 | Test & Verification Infrastructure | `devctl`, CI, seed fixtures, E2E + screenshot harness, trace tool |
| 05 | Agent Operations | (process — applies from Phase 0 onward) |
| 06 | Mobile App Architecture | `apps/mobile` skeleton conforming to architecture |
| 10 | Phase 1 — Foundation & Native Auth | login→ready E2E on device/emulator |
| 11 | Phase 2 — Messaging Core | Discord-grade text chat |
| 12 | Phase 3 — Servers & Channels | full guild management |
| 13 | Phase 4 — Social (Friends/DMs/Presence) | social graph parity |
| 14 | Phase 5 — Media & Attachments | uploads/avatars/embeds on mobile (closes G2/G3) |
| 15 | Phase 6 — Voice & Video | LiveKit voice channels + DM calls |
| 16 | Phase 7 — Parity Gap Features | overwrites, bans, threads, search, etc. (closes G5) |
| 17 | Phase 8 — Notifications, Hardening, Release | push, perf budgets, store-ready builds |

## 0.6 Conventions

- **Requirement IDs**: `FR-<AREA>-<NNN>` / `NFR-<NNN>` as defined in `01-REQUIREMENTS.md`.
  Tests claim coverage with a literal comment `// @satisfies FR-MSG-012` (TS/Kotlin/Swift),
  `# @satisfies …` (Python/YAML incl. Maestro flows). `devctl trace` enforces the matrix.
- **RFC 2119** keywords (MUST/SHOULD/MAY) are used with their standard meaning.
- **Priorities**: P0 = parity MVP (ship-blocking), P1 = full standard parity, P2 = extended
  (build only after all P0+P1 green), OUT = permanently excluded (see 01 §1).
- **Language/tooling pins**: TypeScript `^5.4` strict everywhere; Node 20; Python 3.12;
  package manager `npm` (matches upstream lockfiles — do NOT introduce pnpm/yarn).
- **Formatting/lint**: Prettier + ESLint configs specified in 04 §6; zero warnings policy.
- **Definition of Done (every work item)**: listed FRs implemented · `@satisfies` tests added
  and green · `devctl verify` pass · new/changed endpoints reflected in `contracts/` ·
  `devctl trace check` pass for the phase's FR set · docs touched if behavior changed ·
  Audit pass completed and `docs/DRIFT-LOG.md` appended (an explicit "none" entry counts) ·
  web client still builds and its smoke E2E passes (backend changes only).

## 0.7 What the human will do (so the agent doesn't wait on it)

Provide: Authentik test realm credentials (or approve `DEV_AUTH=1` for all non-prod stacks —
default assumption: approved), Giphy key (optional; feature degrades gracefully), Apple/Google
signing assets at Phase 8, and macOS access for iOS device validation at milestones M1/M5/M8
(see 17 §6). Everything else is agent-executable on a Linux host with Docker, Node 20,
Python 3.12, JDK 17, and Android SDK/emulator.
