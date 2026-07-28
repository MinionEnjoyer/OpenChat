# Production acceptance — 2026-07-28

First time this project has authenticated against a real IdP and a real backend
on either platform. Recorded because the earlier prod acceptance run produced no
artefact and is therefore not evidence of anything, however real it was.

## What was exercised

| | |
|---|---|
| Backend | `https://chat.creeger.com/api` (production) |
| IdP | `https://auth.creeger.com/application/o/chat/` (Authentik) |
| Auth | OAuth2 authorization code + PKCE (S256), browser round trip |
| Android | Pixel 3 XL, APK `7c87e95c` — owner signed in, ran acceptance checks |
| iOS | iPhone 16 Pro simulator, standalone Release — owner signed in |

Both builds have dev-login compiled out (`login-username` absent from the
bundle), so neither could have fallen back to the test path. The only way in was
real PKCE.

## Evidence

- `ios-sim-login-screen.png` — iOS login screen with an idle Sign in button.
  Its predecessor hung on a spinner because the client dialled `10.0.2.2`.
- `ios-sim-authenticated-general.png` — `#general` on iOS after sign-in: real
  message history spanning 2026-07-25 to 2026-07-28, an inline image
  attachment, and a message sent from the simulator itself. Composer shows GIF,
  attach, poll and send.
- `android-authentik-redirect-error.png` — the intermediate failure, kept
  deliberately. Authentik's "Redirect URI Error" before `openchat://auth` was
  whitelisted. It is the proof that the client's request was correct and the
  rejection was configuration.

Network confirmation from the iOS simulator log: 19 requests to
`chat.creeger.com`, 3 to `auth.creeger.com`.

## Three defects cleared to get here

All three presented as "auth failed". None was an auth defect.

1. **Client could not reach any production deployment.** `config.ts` hardcoded
   `http://${API_HOST}:3030/api`, so a build aimed at chat.creeger.com requested
   port 3030 over cleartext. Measured: HTTPS on 443 returns 200, the requested
   URL times out. Fixed by adding `EXPO_PUBLIC_API_URL` (39b3614).
2. **iOS defaulted to an Android-only address.** The host fallback was
   `ANDROID_EMULATOR_HOST` on every platform; `10.0.2.2` does not resolve on
   iOS. Fixed in the same commit. The test that should have caught it asserted
   `10.0.2.2` unconditionally — it encoded the assumption it was meant to check.
3. **`openchat://auth` not registered in Authentik.** Server-side, and
   `docs/AUTH-PRODUCTION-READINESS.md` §3 had listed it days earlier as the first
   thing a production owner must check.

## What this does and does not prove

**Proves:** the native PKCE flow works end to end against a real Authentik on
both platforms — discovery, browser authorization, deep-link return, token
exchange, and authenticated API calls rendering real data.

**Does not prove:** anything automated. These are human-witnessed acceptance
runs. Maestro cannot drive an external IdP login, so the automated suite runs
against dev with dev-login, and production is verified by hand. That split is
deliberate (owner decision, 2026-07-28) and is the honest description of what
coverage exists.

No `artifacts/e2e/receipts/` entries are produced by acceptance runs, and should
not be — receipts attest to an automated flow execution against a known build.
This file is the acceptance equivalent, and it is signed by a human having
looked at the screen.
