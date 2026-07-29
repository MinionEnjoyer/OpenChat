# DR-002 — No OIDC configuration exists in the client-facing API surface

Date: 2026-07-21 · Work item: P0-10 (corrected P0-11) · Status: proposed

## Trigger
Phase-0 falsification: `GET /api/config` returns 401 without a session cookie, and when
authenticated returns only `{shareBaseUrl, jellyfinUrl}` — no OIDC fields. The spec assumption
in 10-PHASE1-FOUNDATION-AUTH.md §P1-03 that the mobile app reads an OIDC config block from
`GET /api/config` before authenticating was wrong on two counts: (1) `/config` is auth-gated,
and (2) even after auth, no OIDC fields exist in the response.

The Phase 1 spec assumed OIDC data lived at `/api/config`. It doesn't. It doesn't live
anywhere in the public API surface.

## Evidence

### Live call (no cookie)
```json
{"message":"Session is invalid or expired","error":"Unauthorized","statusCode":401}
```

### Live call (with dev-login cookie)
```json
{"shareBaseUrl":"http://openshare:8800","jellyfinUrl":"http://localhost:8096"}
```

### Server code
- `apps/api/src/config/config.controller.ts:6` — `@UseGuards(SessionGuard)` on the class; returns
  only `shareBaseUrl` and `jellyfinUrl` (post-auth internal-service URLs).
- `apps/api/src/config/configuration.ts:14-18` — OIDC env vars exist server-side (`OIDC_ISSUER`,
  `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URI`, `OIDC_POST_LOGOUT_REDIRECT_URI`)
  but are consumed ONLY by `AuthService` (`apps/api/src/auth/auth.service.ts:44-47`) and never
  exposed to any client.
- `apps/api/src/auth/auth.service.ts:44` — `Issuer.discover(this.config.getOrThrow('OIDC_ISSUER'))`
  performs OIDC discovery server-side; the web client never touches OIDC URLs.
- `apps/mobile/` — zero OIDC references in any source file (grep for `OIDC|oidc|issuer|clientId|openid`
  returned empty).

### Web client auth flow
The web client never reads OIDC configuration. When unauthenticated (`/api/auth/me` returns 401),
it redirects to `window.location.href = '/api/auth/login'` — the server handles the full OIDC
redirect flow: `GET /api/auth/login` → 302 to Authentik → callback → session cookie set. The
web client's only OIDC interaction is following a redirect.

### Mobile app (does not exist yet)
`apps/mobile/` contains only a contract consumer test fixture. No auth code, no OIDC config
references.

## Where OIDC config actually lives

| Field | Location | Accessible to client? |
|-------|----------|----------------------|
| `OIDC_ISSUER` | Server env var (`configuration.ts`) | No |
| `OIDC_CLIENT_ID` | Server env var | No |
| `OIDC_CLIENT_SECRET` | Server env var | No — MUST stay server-side |
| `OIDC_REDIRECT_URI` | Server env var (web flow; `openchat://auth` for native) | No |
| `OIDC_POST_LOGOUT_REDIRECT_URI` | Server env var | No |

The web client never needs any of these — it follows server-initiated redirects. The mobile
app WILL need `issuer` and `client_id` to perform client-side PKCE (Phase 1 §P1-04), and
neither exists in any client-facing endpoint today.

## Fields the mobile app needs pre-auth

| Field | Required pre-auth? | Sensitive? | Present in any endpoint today? |
|-------|-------------------|------------|-------------------------------|
| `issuer` (OIDC discovery URL) | Yes | No — public URL | No |
| `clientId` | Yes | No — public identifier | No |
| `nativeRedirectUri` | Yes | No — public scheme | No |
| `scopes` | Yes | No | No |
| `client_secret` | **No** — backend-only | **Yes** — MUST NOT reach client | N/A |

The native flow uses public-client PKCE (Authorization Code + PKCE, no client secret).
Phase 1 §P1-01 depends on this: `POST /api/auth/oauth/token` exchanges the code server-side using
the backend-held `OIDC_CLIENT_SECRET`. The mobile app never sees it.

## What `jellyfinUrl` is
Jellyfin is the self-hosted media server used by Watch Party. It is documented in
00-MASTER-SPEC.md §0.3 line 73 ("watch parties (Jellyfin)"). Its URL appears in
`GET /api/config` so the web client can proxy streams through the API
(`/api/watchparty/stream/:itemId`). The `JELLYFIN_API_KEY` stays server-side.

### Other undocumented surface
No additional undocumented integration endpoints were found. All routes in
`capabilities.json` trace to controller code. The two `/config` fields (`shareBaseUrl`,
`jellyfinUrl`) are both documented in §0.3 (OpenShare and Jellyfin respectively).

## Options (re-costed with the real finding)

| Option | Cost | Risk | Evidence |
|--------|------|------|----------|
| **A. Public `/config/public` subset** — But the current `/config` has NO OIDC fields at all. This option becomes "add a new endpoint" — it's not a subset of existing data. The old Option A (public subset of existing `/config`) is vacuous because `/config` returns nothing mobile-relevant. Real cost: add one route + controller method + populate from server env vars. | Low | Low — fields are non-sensitive. | E10: Authentik issuer confirmed reachable. |
| **B. Build-time env in mobile app** — `OIDC_ISSUER` and `OIDC_CLIENT_ID` compiled into the RN app at build time (CI env vars). `nativeRedirectUri` is known at build time (it's the app's own scheme). `scopes` is a constant (`openid profile email`). | Low (CI env vars) | Medium — issuer/client change requires mobile release. But these rarely change. | Standard mobile OIDC approach; no backend code change needed. |
| **C. Mobile hits Authentik `.well-known/openid-configuration` directly** — RFC 8414. Needs issuer URL from somewhere (B). `client_id` must still be bundled (B) — it's not in `.well-known`. So C composes with B; it's not standalone. | Near-zero incremental cost over B | Low if composed with B | RFC 8414; Authentik serves `.well-known`. |
| **D. New additive endpoint** — e.g. `GET /.well-known/openchat-oidc` or `GET /api/auth/oidc-metadata` that returns `{issuer, clientId, nativeRedirectUri, scopes}`. Public (no auth). | Low — one new route, populated from existing env vars. | Low — no secrets. Contract updated. | Cleanest separation; single HTTP dependency for mobile bootstrap. |

### Fields that MUST NOT be public
`OIDC_CLIENT_SECRET` must never reach a public client. The native flow is public-client PKCE
(Authorization Code + PKCE, no client secret). The server exchanges the code using the
backend-held secret. `shareBaseUrl` and `jellyfinUrl` are internal service URLs and must
remain behind the auth gate.

## Recommendation
**Option D (new additive endpoint) with Option C as fallback.** Option D gives the mobile app
a single HTTP call for bootstrap (`GET /.well-known/openchat-oidc`). The endpoint serves only
non-sensitive OIDC discovery fields populated from existing server env vars. Contract is
updated; no existing endpoint is modified. If the API is unreachable (e.g. mobile on flaky
network), the app falls back to Option C (.well-known against a bundled issuer URL).

Option B alone is insufficient because it hardcodes the issuer URL at build time without
discoverability. But `issuer` + `clientId` should ALSO be available as build-time defaults
so the app can start OIDC even when the API is unreachable (cold start on airplane WiFi
connecting to a local Authentik).

**Status: proposed.** Phase 1 owns the implementation. Do not implement in Phase 0.

## Consequences
- **Backend (Option D):** New public endpoint serving `{issuer, clientId, nativeRedirectUri,
  scopes}` from existing env vars. No auth guard.
- **Contract:** New endpoint added to `openapi.yaml` with `security: []`.
- **Mobile:** P1-04 calls the new endpoint on cold start. Falls back to build-time defaults
  (Option B) if unreachable, then Option C (.well-known) after issuer is known.
- **Build:** Mobile CI sets `OIDC_ISSUER` and `OIDC_CLIENT_ID` as build-time env vars
  (Option B defaults).
- **Spec:** 10-PHASE1-FOUNDATION-AUTH.md §P1-03 updated to reflect that OIDC config does
  not currently exist in any endpoint and must be created.

## DRIFT-LOG
A spec assumption about existing platform data was false and survived until now because
nothing tested it. 10-PHASE1-FOUNDATION-AUTH.md §P1-03 assumed `GET /api/config` returned
`{oidc:{issuer, clientId, nativeRedirectUri}}`. In reality, `/api/config` returns only
`{shareBaseUrl, jellyfinUrl}` — no OIDC block. The OIDC env vars exist server-side but are
never exposed to any client. This correction is recorded in `docs/DRIFT-LOG.md`.