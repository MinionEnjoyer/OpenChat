# FR-AUTH-001 Investigation

Date: 2026-07-26 · HEAD: `70908d7`

## Verdict: A — BUILT + UNTESTED

The code fully exists on both server and client sides. No E2E test proves the
acceptance criterion. Two unit tests exist with mocked system browser; neither
exercises the required full loop.

---

## The requirement (specs/01-REQUIREMENTS.md:38)

| ID | Requirement | Acceptance criterion | Pri | Ph |
|----|-------------|----------------------|-----|----|
| FR-AUTH-001 | [BE] Native OIDC login: system-browser PKCE against Authentik, code exchanged at new `POST /api/auth/oauth/token` for bearer access+refresh tokens | E2E: fresh install → login → `GET /api/auth/me` 200 with bearer; no cookies used | P0 | 1 |

The criterion is E2E — the full system-browser round-trip must be exercised.

---

## What exists — server side

### `POST /api/auth/oauth/token` — authorization_code grant
- **`apps/api/src/auth/auth.controller.ts:27-58`** — accepts `grantType: 'authorization_code'` with `code`, `codeVerifier`, `redirectUri`; calls `exchangeNativeCode`; issues bearer + refresh tokens.
- **`apps/api/src/auth/auth.service.ts:133`** — `exchangeNativeCode` validates redirect URI, exchanges the code with the OIDC provider using the server's client_secret.
- **`apps/api/test/integration/bearer-auth.spec.ts:40-45`** — validates grant type rejection (password → 400) but does NOT exercise `authorization_code` grant against a live OIDC provider. Token refresh and rotation are integration-tested (FR-AUTH-002).
- **`apps/api/test/contract/provider.spec.ts:349`** — contract test for `GET /auth/oidc-metadata` → OidcMetadata schema, no auth required.

### `GET /api/auth/oidc-metadata`
- **`apps/api/src/auth/auth.controller.ts:61-64`** — public endpoint, returns `issuer`, `clientId`, `nativeRedirectUri`, `scopes`. No credentials exposed.
- **`apps/api/test/integration/bearer-auth.spec.ts:133-139`** — proves the endpoint is public and never leaks the client secret.

**Server verdict:** BUILT and tested for shape/guards. The `authorization_code` token exchange path is implemented but has never been tested against a live OIDC provider in any test suite.

---

## What exists — client side

### PKCE library (`apps/mobile/src/lib/pkce.ts`, 206 lines)
Committed 2026-07-26 at `7824cd6` ("feat(mobile): OIDC PKCE login client — closes UNBUILT-001").

- **`:35-53`** — `fetchOidcMetadata(baseUrl)` → `GET /auth/oidc-metadata`, validates issuer + clientId present.
- **`:66-69`** — `generatePkcePair()` → delegates to `expo-auth-session/build/PKCE.buildCodeAsync` for S256 verifier/challenge.
- **`:78-104`** — `getAuthorizationUrl()` → discovers the provider's authorization endpoint from `.well-known/openid-configuration` via `expo-auth-session`, builds full auth URL with PKCE params.
- **`:120-156`** — `authorizeViaBrowser()` → opens system browser via `expo-web-browser.openAuthSessionAsync`, extracts `code` from redirect, calls `exchangeCode`.
- **`:165-206`** — `exchangeCode()` → `POST /auth/oauth/token` with `grantType: 'authorization_code'`, code, verifier, redirectUri; returns `{ accessToken, refreshToken, expiresIn, user }`.

### Session store integration (`apps/mobile/src/stores/session.ts:98-110`)
- `loginWithPkce()` — calls `fetchOidcMetadata` → `generatePkcePair` → `authorizeViaBrowser` → saves tokens to vault → sets `signedIn` state.

### Login screen (`apps/mobile/src/features/auth/screens/LoginScreen.tsx`)
- **`:15-21`** — Path split via `const USE_DEV_LOGIN = __DEV__`. Expo inlines this at bundle time; production APKs never ship dev-login UI.
- **`:42-52`** — `submitPkce()` handler with busy guard and error toast.
- **`:80-100`** — Production UI: "OpenChat" title, "Sign in with your OpenChat account to continue." subtitle, "Sign in" button wired to `submitPkce`.

### Dependencies
- `apps/mobile/package.json:24` — `"expo-auth-session": "~57.0.5"` (installed)
- Also uses `expo-crypto`, `expo-web-browser` (both in package.json)

**Client verdict:** BUILT. The full PKCE flow — metadata fetch, verifier/challenge, system-browser auth, code extraction, token exchange — is implemented and wired to the login screen's production path.

---

## What does NOT exist — E2E test

The acceptance criterion demands: **E2E: fresh install → login → `GET /api/auth/me` 200 with bearer; no cookies used.**

Zero E2E flows exercise the OIDC PKCE path:

- `apps/mobile/e2e/` — grep for `PKCE`, `pkce`, `oidc`, `OIDC`, or `auth-session` returns **zero results**.
- Every existing Maestro flow (`_login.yaml`, `p1-01-devlogin-shell.yaml`, `p4-04-presence-profile.yaml`, etc.) uses `_login.yaml` which performs dev-login via `login-username` + `login-submit` — no system-browser interaction.
- `apps/mobile/e2e/flows/_login.yaml:1-28` — taps `login-username`, inputs `${E2E_USERNAME}`, taps `login-submit`. This is dev-login only.

---

## Existing test evidence (insufficient for criterion)

| Test | Kind | What it proves | Gap |
|------|------|----------------|-----|
| `apps/mobile/src/lib/__tests__/pkce.test.ts:1-201` | Unit | PKCE utilities work in isolation: metadata fetch error paths, code exchange body shape, browser cancellation → PkceError. **Own comment at line 4:** *"The system-browser step is mocked — an end-to-end test against a live Authentik instance is required."* | System browser mocked via `jest.mock('expo-web-browser')`. No real auth. |
| `apps/mobile/src/stores/__tests__/session.test.ts:101-114` | Unit | `loginWithPkce` transitions to `signedIn` and persists tokens in vault. Carries `@satisfies FR-AUTH-001` annotation (line 101). | The ENTIRE PKCE module is mocked (`// Mock PKCE module so loginWithPkce can be tested without native modules`, line 5). No OIDC metadata fetch, no browser, no code exchange. |

The `@satisfies FR-AUTH-001` annotation on `session.test.ts:101` remains misleading. It was supposed to have been removed per `docs/LOG.md:337` and `UNBUILT-001`, and the Phase 1 audit (`docs/signoffs/T4-phase1-signoff.md:133-134`) explicitly called for its removal: *"The `@satisfies FR-AUTH-001` annotation on `session.test.ts:101` should be removed."*

---

## Historical context

- **UNBUILT-001 (`docs/BACKLOG.md:216`)** was filed when FR-AUTH-001 was case B (PARTIALLY BUILT) — the server half existed, the client half was completely absent. Evidence: `expo-auth-session` not installed, no PKCE client code, no E2E.
- **Commit `7824cd6`** (2026-07-26) added the client PKCE code and declared UNBUILT-001 closed. The commit itself notes: *"NOT VERIFIED: a real browser login against a live Authentik. Unit-level contract only."*
- **Phase 1 signoff (`docs/signoffs/T4-phase1-signoff.md`)** — ran AFTER the PKCE commit (`HEAD: 92bb88c`). Still marked FR-AUTH-001 as UNSATISFIED because no E2E exists.
- **Trace tool** (`node tools/trace.mjs check`) — no longer lists FR-AUTH-001 as lacking `@satisfies` (the misleading annotation on `session.test.ts:101` satisfies the tool's existence check) but this does not mean the criterion is met.

---

## What changed from UNBUILT-001

UNBUILT-001 correctly diagnosed case B (client half missing). That gap is now closed: the client PKCE code exists. The current state is case A: both halves exist, but the E2E test required by the acceptance criterion has never been written.

---

## Concrete work required to satisfy the criterion

### Required: an E2E Maestro flow

A Maestro flow (e.g. `apps/mobile/e2e/flows/p1-oidc-login.yaml`) that:

1. **Clears app state** — fresh install simulation.
2. **Launches the app** — production build (not dev; `__DEV__` must be `false` so the PKCE login screen renders instead of dev-login).
3. **Taps "Sign in"** → triggers `authorizeViaBrowser()`.
4. **System browser opens** — must navigate to a reachable Authentik (or mocked OIDC endpoint) at the URL built by `getAuthorizationUrl()`.
5. **User authenticates** — browser flow completes, redirect fires `openchat://auth?code=...`.
6. **App receives the callback** — `WebBrowser.openAuthSessionAsync` resolves with the redirect URL containing the authorization code.
7. **Code exchanged** — `POST /api/auth/oauth/token` returns 201 with `{ accessToken, refreshToken, expiresIn, user }`.
8. **Assert** — `GET /api/auth/me` returns 200 with the authenticated user's username, no cookies in the request.

### Prerequisites

- A **production APK build** (not Expo dev client) — `__DEV__` must be `false` so `LoginScreen` renders the PKCE path. Expo dev builds always use `USE_DEV_LOGIN = true`.
- A **reachable OIDC provider** — either a real Authentik instance in the dev stack or a mocked OIDC endpoint that accepts the authorization request and returns a redirect with a valid code.
- The test device/emulator must have the `openchat://` deep link scheme registered so the browser redirect arrives back in the app.

### Why unit/integration tests are insufficient

The criterion explicitly says E2E. A unit test with mocked `expo-web-browser` cannot prove:
- The system browser actually opens with the correct URL.
- The deep-link redirect successfully returns to the app.
- The authorization code survives the cross-process round-trip.
- The token exchange works against a real server with a real OIDC provider.
- No cookies are used (the criterion's explicit constraint).
