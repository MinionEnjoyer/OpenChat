# 10 — PHASE 1: Foundation & Native Auth (closes G1)

Goal: a fresh install can log in via Authentik (or dev-login in test), hold a durable session,
connect the gateway, and stand in the Discord-shaped shell with live connection status.
FRs: AUTH-001..007(partial-006), AUTH-010, APP-001, APP-003, APP-006(scaffold).

Out of scope: any message rendering beyond a placeholder list; server browsing beyond a
static rail fed by `GET /servers`; profile avatar upload (Phase 5); iOS store config.

## Backend work items (additive; web client untouched behaviorally — NFR-10 gate on every one)

**P1-01 [BE] Bearer token issuance — `POST /api/auth/token`**
- Grant `authorization_code`: body `{grantType:"authorization_code", code, codeVerifier,
  redirectUri}`. Server exchanges against Authentik using existing `openid-client` config but
  with the NATIVE redirect URI (`openchat://auth`; register a second redirect in the
  Authentik app — document in `docs/SETUP-MOBILE.md`), validates, upserts user by `authSub`
  exactly as the web callback does (extract shared `AuthService.loginFromClaims(claims)`
  refactor so both paths share one code path — characterization tests must stay green).
- Grant `refresh_token`: body `{grantType:"refresh_token", refreshToken}`.
- Response: `{accessToken, expiresIn: 3600, refreshToken, user}`; access = JWT (existing
  `@nestjs/jwt`, HS256, secret `JWT_SECRET` new env, claims `{sub: userId, typ:"access"}`);
  refresh = opaque 256-bit random, Redis `rt:<hash>` → `{userId, familyId, exp 30d}`,
  **rotation with family revocation on reuse** (FR-AUTH-002).
- Tests: unit (token svc incl. reuse-detection) + integration (full PKCE against the
  containerized Authentik fixture, nightly lane) + contract.

**P1-02 [BE] `BearerAuthGuard` + composite `AuthGuard` replacing every `SessionGuard` usage**
- Order: valid bearer → attach user; else existing session path; else 401. One-line change
  per controller; `@CurrentUser` unchanged. Characterization suite (cookie-based) must pass
  untouched — that is the proof of backward compatibility.
- `GET /auth/ws-ticket` therefore works with bearer (FR-AUTH-005). `POST /auth/logout` with
  bearer revokes the presented refresh family (body `{refreshToken}`) and returns `{}`.
- `POST /auth/dev-login`: when `DEV_AUTH=1`, ALSO return `{accessToken, refreshToken}`
  alongside the session cookie (test path for mobile; still 404 in prod).

**P1-03 [BE] Contract + config updates + OIDC discovery endpoint**: add routes/security
schemes to `openapi.yaml` (`x-added-by: P1`), regen types, provider contract tests.
Create a new **public** OIDC metadata endpoint (e.g. `GET /api/auth/oidc-metadata` or
`GET /.well-known/openchat-oidc`) returning `{issuer, clientId, nativeRedirectUri, scopes}`
(no secrets — `client_secret` is backend-only). Populated from existing server env vars
(`OIDC_ISSUER`, `OIDC_CLIENT_ID`, plus `NATIVE_REDIRECT_URI` added to config).

**CORRECTION (DR-002, 2026-07-21):** The original spec assumed `GET /api/config` already
returned `{oidc:{issuer, clientId, nativeRedirectUri}}`. It does not — `/api/config`
returns only `{shareBaseUrl, jellyfinUrl}` (both post-auth internal service URLs) and is
behind `SessionGuard`. No OIDC fields exist anywhere in the client-facing API surface
today. The OIDC env vars exist server-side (consumed by `AuthService`) but are never
exposed to any client. This work item therefore includes **creating** the OIDC metadata
endpoint, not modifying `/api/config`. See DR-002 for options (D recommended: new
additive endpoint) and cost/risk analysis.

## Mobile work items

**P1-04 Auth flow (`features/auth`)**
- Login screen → `expo-auth-session` PKCE against issuer from config → code → `/auth/token` →
  tokens into SecureStore → `['me']` primed. Logout per FR-AUTH-004. Silent refresh
  interceptor per 06 §5 (single-flight; FR-AUTH-010). E2E `p1-02-devlogin-session-restore`
  (dev-login path): login → kill → relaunch → authenticated (FR-AUTH-003). Nightly
  `p1-01-oidc-login` real-browser flow.

**P1-05 Gateway client (`realtime/`)**
- Ticket fetch → connect `wss://…/ws?ticket=`; heartbeat compliance verified against E2 notes
  (RN `WebSocket` auto-pongs ws-pings — Phase-0-verify, else app-level keepalive per
  contract); typed emitter from generated union; backoff + resubscribe + invalidate per
  06 §3; connection state store feeding FR-APP-003 banner.
- Tests: unit backoff schedule table; chaos integration `kill ws 20×` (NFR-07); integration
  receive `message.created` for a subscribed channel via second dev user.

**P1-06 App shell (`features/shell`)**
- Rail (data: `GET /servers`, unread dots stubbed to 0) · channel drawer (real channels of
  selected server, tap selects, content pane placeholder) · members drawer (real members,
  presence dot placeholder) · gesture drawers · connection banner. Maestro
  `p1-03-shell-walk` (FR-APP-001), `p1-04-offline-banner` (FR-APP-003 via netem).

**P1-07 Profile basics**: settings→account screen; edit username/displayName/status text via
`PATCH /me` with optimistic update + toast on failure (FR-AUTH-006 sans avatar,
FR-APP-006 first real use). Two-device E2E asserts propagation via member list after
`notify`-triggered refetch.

**P1-08 Audit & refactor** per 05 §8 + phase signoff T4. Demo script: fresh emulator →
OIDC login (nightly rig) → shell walk → airplane-mode banner → relaunch persistence → logout.

## Phase gates
`devctl verify` + `e2e-android` green incl. new flows · trace check for the FR set above ·
web-smoke green (proves P1-01..03 broke nothing) · characterization suite untouched-and-green ·
contracts regenerated with zero diff in CI · signoff committed.
