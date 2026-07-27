# Desktop PKCE Adoption Proposal (RFC 7636)

## Problem

`GET /auth/desktop` currently mints a bearer token and delivers it via deep link:

```
openchat://auth?token=<LIVE BEARER TOKEN>
```

Any application on the system can register the `openchat://` URI scheme and intercept this token. The token grants full authenticated access — no second factor, no user confirmation. This is the exact interception weakness that RFC 8252 (OAuth 2.0 for Native Apps) and RFC 7636 (PKCE) were designed to prevent.

## Solution: Opt-in PKCE

The server now supports an opt-in PKCE flow on `GET /auth/desktop`. When the desktop client sends `code_challenge` (S256) and `code_challenge_method=S256` query parameters, the server returns a single-use authorization **code** instead of a bearer token:

```
openchat://auth?code=<single-use, 60s TTL>
```

The code is useless without the corresponding `code_verifier` — a secret only the legitimate desktop client holds. The client exchanges the code at the existing `POST /auth/token` endpoint:

```
POST /auth/token
{ "grantType": "authorization_code", "code": "<code>", "codeVerifier": "<verifier>", "redirectUri": "openchat://auth" }
```

If a malicious app intercepts the code, it cannot exchange it without the verifier. If it tries a wrong verifier, the code is consumed and becomes permanently invalid (anti-brute-force).

## Both Flows Side by Side

| | Default (today) | Opt-in PKCE |
|---|---|---|
| **Query params** | *(none)* | `?code_challenge=<S256>&code_challenge_method=S256` |
| **Deep link** | `openchat://auth?token=oc_...` | `openchat://auth?code=<hex>` |
| **Credential in URL** | Bearer token (live) | Authorization code (useless without verifier) |
| **Exchange** | Not needed | `POST /auth/token` with verifier |
| **Reuse** | N/A (token is long-lived) | Code is single-use, consumed on first exchange |
| **TTL** | 30d (refresh token) | 60s (code) |
| **Client change** | None | Generate PKCE pair, parse `?code=`, POST exchange |

## What Is NOT Changing

- **`POST /auth/tokens` / `GET /auth/tokens` / `DELETE /auth/tokens/:id`** — unchanged. These remain the correct endpoints for long-lived programmatic bearer tokens (bots, CI, third-party integrations).
- **`ApiToken` model** — unchanged. Not deprecated.
- **The default (no-params) flow** — byte-identical to today. Existing desktop clients continue to receive bearer tokens exactly as before. No flag day.

## Tauri Migration Path

The desktop client (`apps/desktop/src-tauri/src/lib.rs`) currently parses the deep link in `handle_auth_url`:

```rust
fn handle_auth_url(app: &AppHandle, url: &str) {
    if let Some((_, rest)) = url.split_once("token=") {
        let token = rest.split('&').next().unwrap_or(rest);
        if !token.is_empty() {
            let _ = app.emit("auth-token", token.to_string());
        }
    }
    // ...
}
```

### UNVERIFIED BY US — Migration Sketch

The following is a conceptual sketch only. It has not been compiled, tested, or run.

```rust
use sha2::{Sha256, Digest};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use rand::RngCore;

fn generate_pkce_pair() -> (String, String) {
    let mut verifier = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut verifier);
    let verifier_b64 = URL_SAFE_NO_PAD.encode(verifier);

    let mut hasher = Sha256::new();
    hasher.update(verifier_b64.as_bytes());
    let challenge = URL_SAFE_NO_PAD.encode(hasher.finalize());

    (verifier_b64, challenge)
}

fn handle_auth_url(app: &AppHandle, url: &str) {
    // 1. Existing token path (backward compat)
    if let Some((_, rest)) = url.split_once("token=") {
        let token = rest.split('&').next().unwrap_or(rest);
        if !token.is_empty() {
            let _ = app.emit("auth-token", token.to_string());
        }
    }
    // 2. New PKCE code path
    if let Some((_, rest)) = url.split_once("code=") {
        let code = rest.split('&').next().unwrap_or(rest);
        if !code.is_empty() {
            // Retrieve the stored verifier (set before navigating to SSO)
            let verifier = get_stored_verifier();
            let _ = app.emit("auth-pkce-code", serde_json::json!({
                "code": code,
                "codeVerifier": verifier,
            }));
        }
    }
    // ...
}
```

The web layer would then call `POST /auth/token` with the code + verifier and receive `{ accessToken, refreshToken, expiresIn, user }` — identical to the existing mobile PKCE flow.

### Dependencies to add (Cargo.toml)

```toml
sha2 = "0.10"
base64 = "0.22"
rand = "0.8"
```

### Steps

1. Add PKCE dependency crates.
2. Generate a PKCE pair before navigating the user to `GET /auth/desktop?code_challenge=...&code_challenge_method=S256`.
3. Store the `code_verifier` in memory or secure storage.
4. In `handle_auth_url`, detect `?code=` in addition to `?token=`.
5. Exchange the code + verifier at `POST /auth/token` from the web layer.
6. Once deployed widely, consider deprecating the token path (but not before all clients have migrated).

## Adoption

- **Opt-in**: clients that do not send `code_challenge` + `code_challenge_method=S256` continue to receive bearer tokens exactly as today.
- **No flag day**: the server supports both flows indefinitely.
- **No forced upgrade**: existing desktop clients are not broken.

## RFC References

- [RFC 7636 — Proof Key for Code Exchange (PKCE)](https://datatracker.ietf.org/doc/html/rfc7636)
- [RFC 8252 — OAuth 2.0 for Native Apps](https://datatracker.ietf.org/doc/html/rfc8252), §8.2 (Claims-based URI Redirection Interception)
