# Phase 1 Signoff — Auth, Shell & Gateway Foundation

Date: 2026-07-26 · Base tag: `phase0-signoff` · New tag: (none — NOT GRANTED)
HEAD at audit: `92bb88c` — Merge branch 'mobile-pkce': OIDC PKCE login client (closes UNBUILT-001)

## Verdict: NOT GRANTED

Three P0 requirements are not satisfied by evidence matching their acceptance
criteria. This signoff documents what is proven, what is not, and what must
change before Phase 1 can be signed off.

The full audit is at `docs/signoffs/T4-phase1-audit.md`. This document is the
signoff judgment — it assumes the audit's evidence classification and
summarises the blocking findings.

## What is real and proven (SATISFIED P0s)

- **FR-AUTH-005** — WS ticket obtainable via bearer. The `bearer-auth.spec.ts`
  integration test issues a bearer token via dev-login, calls
  `GET /api/auth/ws-ticket`, and opens a real WebSocket that receives the
  `ready` op. Full chain proven against the live API.

- **FR-APP-001** — Discord-shaped shell. The `p1-01-devlogin-shell.yaml`
  Maestro flow walks all four surfaces on-device: server rail, channel drawer,
  chat pane, and members drawer, including drawer open/close and scrim
  dismissal. Uses a provisioned test world (no hardcoded names).

## What is proven but not P0-gating (SATISFIED non-P0)

- **FR-AUTH-002** — Token rotation + reuse-rejection. Integration test proves
  rotation (rt1→rt2, rt2≠rt1), reuse of spent token → 401, and the family-kill
  rule (legitimately-rotated sibling is also dead). Acceptance criterion is
  `[redacted]` in the spec; verdict based on requirement text.

- **FR-AUTH-003** — Session survives app restart. The `p1-02-session-restore.yaml`
  E2E Maestro flow proves login → kill → relaunch → shell-screen visible,
  login-screen not visible. Caveat: uses dev-login, not native OIDC.

- **FR-AUTH-004** — Logout revokes refresh token. Server integration test
  proves family revocation; client unit test proves local vault clearing +
  revocation POST. Criterion `[redacted]`.

## P0 blockers

### 1. FR-AUTH-001 — Native OIDC login (UNSATISFIED)

**What the criterion demands:** E2E: fresh install → login → `GET /api/auth/me`
200 with bearer; no cookies used.

**What exists:** Two unit tests with mocked system browser.

- `apps/mobile/src/lib/__tests__/pkce.test.ts` — mocks `openAuthSessionAsync`,
  tests code exchange body shape and error paths. Own comment: *"The
  system-browser step is mocked — an end-to-end test against a live Authentik
  instance is required."*
- `apps/mobile/src/stores/__tests__/session.test.ts:101` — carries
  `@satisfies FR-AUTH-001`, mocks the entire PKCE module, tests that
  `loginWithPkce` stores tokens in a memory vault.

**Why it blocks:** UNBUILT-001 was filed for exactly this gap and the most
recent merge (`92bb88c`) adds the client PKCE *code* but not an E2E flow. The
`@satisfies` annotation on the mocked unit test was supposed to have been
removed (LOG.md:337) and remains — misleading, but even absent, the E2E
criterion is unmet.

**What would satisfy it:** A Maestro flow that: clears app state, launches,
triggers the system-browser OIDC flow against a reachable Authentik (or mocked
OIDC endpoint), completes the code exchange, and asserts `GET /api/auth/me`
returns 200 with the authenticated user.

### 2. FR-AUTH-006 — Profile edit visible to second client (UNSATISFIED)

**What the criterion demands:** E2E: change display name → visible in a message
from a second client.

**What exists:** `apps/mobile/src/stores/__tests__/profile.test.ts:19` — unit
test with mocked `global.fetch`. Tests optimistic apply and rollback on failure.

**Why it blocks:** A unit test with a mocked fetch cannot demonstrate
cross-device message visibility. FR-AUTH-006 is split Phase 1/5 (profile edit
Ph1, avatar Ph5) but the criterion is a single two-device E2E.

**What would satisfy it:** A two-device Maestro flow: device A edits display
name → device A sends a message in a shared channel → device B sees the message
rendered with the new display name.

### 3. FR-APP-003 — Connection banner (WEAK-EVIDENCE on P0)

**What the criterion demands:** Integration: drop WS → banner ≤3s; restore →
banner clears, missed message appears without manual refresh.

**What exists:**
- `tools/e2e-offline-banner.sh` — shell script toggling airplane mode on a real
  device via adb, asserting banner appears ≤15s offline and clears ≤60s after
  reconnect. This is E2E, not integration.
- `apps/mobile/src/stores/__tests__/connection.test.ts` — unit test for banner
  state logic (everConnected transitions). No network layer.

**Why it blocks:** Three gaps:
1. Neither piece is the required evidence kind (Integration).
2. The timeout is 15s vs the spec's 3s.
3. The "missed message appears without manual refresh" clause is completely
   untested — no evidence exercises auto-resubscribe + refetch on reconnect.

**What would satisfy it:** An integration test that drops the WS connection
at the transport level (not via airplane mode), asserts the banner within 3s,
restores the connection, asserts the banner clears, and verifies a message
sent during the outage appears after reconnect without manual refresh.

## P1 not-yet-proven (non-blocking but material)

- **FR-AUTH-010** — Session expiry handling. Unit test (`client.test.ts`) proves
  single-flight refresh and hard-logout-on-failure, but the criterion
  explicitly demands Integration (mock 401 storm). No test exercises the actual
  interceptor against a server returning 401s.

## Deviations from spec

- **DR-002** (carried from Phase 0): `/api/config` does not expose OIDC
  metadata; Phase 1 created the dedicated `/api/auth/oidc-metadata` endpoint
  per the plan. The metadata endpoint is tested in `bearer-auth.spec.ts`
  (no secret leak) and consumed by the PKCE client (`pkce.ts` →
  `fetchOidcMetadata`). DR-002 is resolved within Phase 1's scope.

## Known-not-done, carried into the next attempt

- **No E2E exits that prove the OIDC PKCE flow end-to-end.** The client code
  and server endpoint both exist and are unit/integration-tested in isolation,
  but the system-browser round-trip has never been exercised on-device.
- **No two-device E2E exists at all.** FR-AUTH-006 requires it; future phases
  (FR-MSG-002, FR-MSG-003, FR-MSG-006) also demand two-device propagation ≤2s.
  Building a two-device Maestro harness is a prerequisite for multiple P0s.
- **The `@satisfies FR-AUTH-001` annotation on `session.test.ts:101` should be
  removed.** It was already identified as misleading in LOG.md:337 and UNBUILT-001.

## Audit counts

| Verdict | Count |
|---------|-------|
| SATISFIED | 5 (AUTH-002, AUTH-003, AUTH-004, AUTH-005, APP-001) |
| WEAK-EVIDENCE | 2 (AUTH-010, APP-003) |
| UNSATISFIED | 2 (AUTH-001, AUTH-006) |
| **Total Phase 1 FRs** | **9** |
| **P0 blockers** | **3** (AUTH-001, AUTH-006, APP-003) |

## What this signoff does not claim

This audit judges evidence quality, not code quality. The PKCE client code in
`pkce.ts` may be correct; the profile edit store logic in `session.ts` may be
correct; the connection banner component in `ShellScreen.tsx` may be correct.
The gap is that the acceptance criteria demand evidence at a higher level than
anything written — and that gap is what blocks the signoff.

No NFRs are evaluated here. NFR-03 (APK size, armed at Phase 1), NFR-08
(mobile tsc, armed at Phase 1), and NFR-10 (web smoke, armed at Phase 1) each
have their own gate status tracked by `devctl nfr`. This signoff only judges
FR acceptance.
