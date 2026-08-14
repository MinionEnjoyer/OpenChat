# Auth production readiness

**Last reviewed:** 2026-08-01

**Production line:** OpenChat 0.8.49 and current `main`

## Answer: code-ready, deployment-dependent

Web, desktop, and mobile authentication paths are implemented. Browser clients use an Authentik
OIDC session; desktop and mobile clients use Authorization Code + PKCE and exchange the code for
rotating bearer/refresh tokens through OpenChat. A real system-browser mobile OIDC flow against the
production Authentik tenant is still an operator acceptance check rather than a trusted automated
gate.

## Authentication paths

### Browser session

1. `GET /api/auth/login` generates state, nonce, and a PKCE verifier and redirects to the configured
   OIDC provider.
2. `GET /api/auth/callback` validates the response, upserts the OpenChat user, and establishes a
   Redis-backed `chat.sid` session.
3. Protected API calls and same-origin `/api/media/...` requests authenticate with that secure,
   HTTP-only cookie.

### Native desktop/mobile PKCE

1. `GET /api/auth/oidc-metadata` returns the public issuer, client ID, native redirect URI, and
   scopes. The client secret is never returned.
2. The client creates a verifier/S256 challenge and opens the system browser. Production mobile
   code uses `expo-web-browser`; desktop uses the registered `openchat://` handoff.
3. Authentik redirects to `openchat://auth?code=...`.
4. The client posts the code, verifier, and redirect URI to `POST /api/auth/oauth/token`.
5. OpenChat performs the confidential-client exchange server-side and returns an access token plus
   a rotating refresh-token family. Native API and WebSocket requests then use bearer auth.

Development username login remains compile-time/environment gated and is not rendered by a normal
production mobile build.

## Required server configuration

| Variable | Requirement | Purpose |
|---|---|---|
| `OIDC_ISSUER` | URL, required | OIDC discovery issuer |
| `OIDC_CLIENT_ID` | required | Public client identifier used by web and native flows |
| `OIDC_CLIENT_SECRET` | required | Confidential secret held only by the API |
| `OIDC_REDIRECT_URI` | URL, required | Browser callback, normally `https://<chat>/api/auth/callback` |
| `OIDC_POST_LOGOUT_REDIRECT_URI` | URL, required | Browser post-logout destination |
| `NATIVE_REDIRECT_URI` | optional; defaults to `openchat://auth` | Desktop/mobile deep-link callback |
| `JWT_SECRET` | required | Signs native access tokens |

All entries above are covered by the API's Zod environment schema. A configured
`NATIVE_REDIRECT_URI` must exactly match the URI registered with the OIDC provider.

## Authentik provider requirements

The OpenChat OAuth2/OpenID provider must:

- remain a confidential client with Authorization Code and S256 PKCE enabled;
- register both the browser callback and `openchat://auth` (or the configured native URI);
- grant `openid profile email`; and
- remain reachable from both users' browsers and the OpenChat API container.

Do not place `OIDC_CLIENT_SECRET` in a desktop/mobile bundle. The API is the only component that
uses it during the native code exchange.

## Production acceptance check

Use a non-admin test account and a release build:

1. Start signed out and select **Sign in**.
2. Complete Authentik login in the system browser.
3. Confirm the deep link returns to OpenChat and `GET /api/auth/me` succeeds with bearer auth.
4. Restart the client and confirm the refresh family restores the session without a cookie.
5. Reuse an old refresh token and confirm it is rejected/revokes the compromised family.
6. Confirm logout clears local tokens and subsequent protected API calls return 401.

Never put live credentials, access tokens, refresh tokens, cookies, or Authentik secrets in test
artifacts. The remaining evidence gap is the real-browser production OIDC traversal, not missing
client or server implementation.
