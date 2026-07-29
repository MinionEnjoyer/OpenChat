# Auth Production Readiness

**Date:** 2026-07-26
**Question:** Can the OpenChat mobile app authenticate against production `chat.creeger.com` (Authentik-backed)?

## Answer: CONDITIONAL YES

The backend code at `POST /auth/oauth/token` (grant `authorization_code`) is fully implemented and operates server-side with no cookie/session dependency. The mobile app's OIDC system-browser PKCE flow is **spec'd but not yet implemented in the shipped mobile code** (see Unknowns §5). Once that client code exists, auth will work **provided** the production Authentik is configured with the items below.

---

## 1. How the native PKCE flow actually works (from code)

The flow has three stages:

### Stage A — Discovery (mobile → server, no auth)
`GET /auth/oidc-metadata` returns `{issuer, clientId, nativeRedirectUri, scopes}`.
- Controller: `AuthController.oidcMetadata()` (auth.controller.ts:62)
- Service: `AuthService.oidcMetadata()` (auth.service.ts:150-157)
- No secrets exposed; `client_secret` stays server-side.

### Stage B — Authorization (mobile ↔ Authentik, server uninvolved)
The mobile app opens the system browser to the Authentik authorization endpoint:
- `client_id` from discovery
- `redirect_uri` = `openchat://auth` (or `NATIVE_REDIRECT_URI` if overridden)
- `response_type=code`
- `code_challenge` + `code_challenge_method=S256` (PKCE)
- `scope=openid profile email`

After user approves, Authentik redirects to `openchat://auth?code=ABC...`. The mobile app catches the deep link and extracts the `code`.

### Stage C — Token exchange (mobile → server, server → Authentik)
`POST /auth/oauth/token` body: `{grantType:"authorization_code", code, codeVerifier, redirectUri}`.
- Controller: `AuthController.token()` (auth.controller.ts:38-49)
- Service: `AuthService.exchangeNativeCode()` (auth.service.ts:133-147)

The **server** performs the code exchange against Authentik using `client.callback()`, passing the `code`, `redirectUri`, and `code_verifier`. This `client` is the same **confidential client** (with `client_secret`) used for the web login flow — see `getClient()` at auth.service.ts:44-50:

```ts
this.client = new issuer.Client({
  client_id:    this.config.getOrThrow<string>('OIDC_CLIENT_ID'),
  client_secret: this.config.getOrThrow<string>('OIDC_CLIENT_SECRET'),
  redirect_uris: [this.config.getOrThrow<string>('OIDC_REDIRECT_URI')],
  response_types: ['code'],
});
```

**Implication:** The same Authentik client serves both the web cookie flow (redirect to `OIDC_REDIRECT_URI`) and the native PKCE flow (server finishes exchange for the `openchat://auth` code). The Authentik client **must** be confidential (it has a secret), and the secret lives on the server — never on the mobile device. This is correct architecture.

---

## 2. Server env vars required for native auth

| Env var | Required? | Validated? | Example for production | Purpose |
|---|---|---|---|---|
| `OIDC_ISSUER` | **yes** | URL (Zod) | `https://auth.creeger.com/application/o/chat/` | Authentik issuer; used for OIDC discovery at boot |
| `OIDC_CLIENT_ID` | **yes** | non-empty string | (from Authentik's "chat" application) | Client ID shared by web + native flows |
| `OIDC_CLIENT_SECRET` | **yes** | non-empty string | (from Authentik's "chat" application) | Server-side secret; used in every code exchange |
| `OIDC_REDIRECT_URI` | **yes** | URL (Zod) | `https://chat.creeger.com/api/auth/callback` | Web callback; registered in Authentik for the browser flow |
| `OIDC_POST_LOGOUT_REDIRECT_URI` | **yes** | URL (Zod) | `https://chat.creeger.com` | Post-logout landing; used by web session logout |
| `NATIVE_REDIRECT_URI` | **no** (defaults) | **NO** (⚠️ missing from Zod schema) | `openchat://auth` | Custom URI scheme the mobile deep-link catches |
| `JWT_SECRET` | **yes** | non-empty string | (generate with `openssl rand -hex 32`) | Signs the bearer access JWT returned by `/auth/oauth/token` |

**⚠️ Gap:** `NATIVE_REDIRECT_URI` is read at runtime via `this.config.get<string>('NATIVE_REDIRECT_URI') ?? 'openchat://auth'` (auth.service.ts:134), but it is **not in the Zod validation schema** in `configuration.ts`. If it's ever set to a wrong value, the error surfaces only at runtime (HTTP 400 on token exchange) rather than at boot. This should be added to the schema as `z.string().optional().default('openchat://auth')`.

---

## 3. Authentik client configuration required for production

The **single** Authentik OAuth2/OpenID Provider + Application (already configured for the web flow, per SETUP.md) must also support the native flow. The following items must be verified/added in the Authentik admin panel for the `chat` application:

### Required settings

| Setting | Value | Notes |
|---|---|---|
| **Client type** | **Confidential** | Server holds `OIDC_CLIENT_SECRET` and uses it in every exchange (auth.service.ts:47). Do NOT change to Public — that breaks both web and native flows. |
| **Authorization grant types** | Authorization code (with PKCE) | PKCE (`code_challenge_method=S256`) is used in `beginLogin()` (auth.service.ts:71) and verified by Authentik. The server passes `code_verifier` in `exchangeNativeCode()` (auth.service.ts:142). |
| **Redirect URIs** | **Both** of these: `https://chat.creeger.com/api/auth/callback` and `openchat://auth` | `OIDC_REDIRECT_URI` (web) + `NATIVE_REDIRECT_URI` (mobile deep-link). Authentik must accept the custom scheme `openchat://auth` as a valid redirect URI. |
| **Scopes** | `openid profile email` | Hardcoded in `beginLogin()` (auth.service.ts:67) and `oidcMetadata()` (auth.service.ts:155). |
| **Signing algorithm** | RS256 (default) | The server performs standard OIDC discovery; Authentik's default RS256 works. |

### What the production owner must check

1. **Does the Authentik `chat` application have `openchat://auth` registered as a redirect URI?** If the current setup only has the web callback URL (`https://chat.creeger.com/api/auth/callback`), native auth will fail at the authorization step — Authentik will reject the redirect.
2. **Is PKCE (S256) enabled for the authorization code grant?** Most OIDC providers allow PKCE by default for confidential clients, but verify.
3. **Is `NATIVE_REDIRECT_URI` set on the production server?** It defaults to `openchat://auth`, which is almost certainly correct. If the owner chose a different custom scheme, it must match what's registered in Authentik.

---

## 4. Code changes needed for production

### In our code (minor)
- **Add `NATIVE_REDIRECT_URI` to the Zod env schema** in `apps/api/src/config/configuration.ts`:
  ```ts
  NATIVE_REDIRECT_URI: z.string().optional().default('openchat://auth'),
  ```
  Without this, a misconfigured `NATIVE_REDIRECT_URI` fails silently at runtime instead of at boot.
- **Add `NATIVE_REDIRECT_URI` to `.env.example`** as a commented optional field, so deployers know it exists.
- **Mobile OIDC flow is not yet implemented** — the current `LoginScreen.tsx` only has dev-login (see LoginScreen.tsx:13: "the OIDC system-browser flow … is the nightly lane and arrives once an Authentik fixture exists"). The mobile app needs the PKCE client code (expo-auth-session, code challenge generation, deep-link handling, then `POST /auth/oauth/token`).

### No changes needed to the server token exchange
`exchangeNativeCode()` is complete. It has no session/cookie dependency, validates the redirect URI, performs the code exchange server-side with the client secret, and returns JWT access + opaque refresh tokens. This path is production-ready.

---

## 5. Cookie / session analysis

**Native auth has no cookie or browser-session dependency.** The evidence:

- `exchangeNativeCode(auth.service.ts:133)` takes `code`, `codeVerifier`, and `redirectUri` directly from the POST body — no `req.session`, no cookie.
- The `AuthController.token()` handler (auth.controller.ts:28-49) is unguarded — no `@UseGuards(SessionGuard)`, no `@Req()`.
- After exchange, the server returns `{accessToken, expiresIn, refreshToken, user}` as JSON. The mobile client stores these and attaches `Authorization: Bearer <accessToken>` to subsequent API calls.
- All protected endpoints use `AuthGuard` (auth.guard.ts), which checks bearer token first, then falls back to session cookie for web clients.

The web login path (`GET /auth/login` → `GET /auth/callback`) remains cookie-based and is completely separate.

---

## 6. Unknowns — what the production owner must verify

These cannot be determined from our code and require access to `chat.creeger.com`'s Authentik admin panel:

1. **Does the Authentik `chat` application have `openchat://auth` as a registered redirect URI?** This is the single most likely blocker. Native auth will fail at the authorization redirect if it's missing.
2. **Is PKCE (S256) allowed for this confidential client?** Should be default-on in modern Authentik, but verify.
3. **Is `NATIVE_REDIRECT_URI` set on the production server?** Default `openchat://auth` is correct; but if the owner customized it, the custom value must also be registered in Authentik.
4. **Is the Authentik issuer URL reachable from the API container?** The docker-compose pins AUTH_HOST via `extra_hosts`; verify the LAN_HOST_IP routing works for the `openid-client` library's discovery + token endpoint calls.
5. **Is the mobile app's OIDC PKCE client code implemented?** The backend is ready, but the current mobile `LoginScreen.tsx` only has dev-login. The OIDC system-browser flow is spec'd as a "nightly lane" that "arrives once an Authentik fixture exists" (LoginScreen.tsx:13-14). The production owner needs the mobile app build that includes this OIDC flow.
