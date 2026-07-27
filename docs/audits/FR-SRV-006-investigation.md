# FR-SRV-006 Investigation — Verdict: A (BUILT + UNTESTED at E2E level)

**Date:** 2026-07-26
**Auditor:** Codewhale (no device, static analysis only)
**Requirement:** FR-SRV-006 — "Invites: create (view existing code UX), share sheet, accept via code entry + deep link; invite preview screen"
**Acceptance criterion:** "E2E: fresh user joins via `openchat://invite/<code>`"
**Priority:** P0, Phase 3

## Verdict: A — BUILT + UNTESTED

The code is fully built on both the API and mobile-client sides and is proven
correct by a multi-actor integration test. The missing piece is the E2E Maestro
flow that the acceptance criterion explicitly demands: open the deep link, tap
Accept, and verify the server appears. This is NOT an FR-AUTH-001-shaped gap
(where one half never existed). Both halves exist and work; the evidence is one
level too low.

## Evidence: what exists

### API (backend) — fully built

| File | What |
|------|------|
| `apps/api/src/invites/invites.controller.ts` | `POST /servers/:id/invites` (create), `GET /invites/:code` (preview), `POST /invites/:code/accept` (accept) |
| `apps/api/src/invites/invites.service.ts` | Full implementation: 8-char code generation, maxUses/expiresInHours, ban rejection (P7), idempotent re-accept, Prisma transaction, audit log, Redis `MEMBER_JOINED` event |
| `apps/api/src/invites/invites.module.ts` | Module registered in `app.module.ts` |
| `apps/api/test/integration/p3-04-invites.spec.ts` | **Multi-actor**: Alice creates server + invite → Bob (fresh user, 404 on members) previews → accepts → Bob IS a member (200 on members). Also: idempotent re-accept. |
| `apps/api/test/characterization/invites.spec.ts` | Create, preview, accept with shape assertions; notification-based accept/decline |
| `apps/api/test/contract/provider.spec.ts:435-440` | Contract validation for `createInvite` response schema |

### Mobile client — fully built

| File | What |
|------|------|
| `apps/mobile/src/features/invites/screens/InviteCreateOverlay.tsx` | Create-invite bottom sheet with native `Share.share()` and clipboard copy. Hits `POST /servers/:id/invites`. |
| `apps/mobile/src/features/invites/screens/InvitePreviewOverlay.tsx` | Preview overlay: fetches `GET /invites/:code`, shows server name + inviter + expires. Accept button calls `POST /invites/:code/accept`. |
| `apps/mobile/src/features/invites/screens/JoinServerOverlay.tsx` | Manual code-entry screen: text input → `GET /invites/:code` lookup → preview → accept. |
| `apps/mobile/src/domain/links.ts:18-76` | `parseInviteLink()` (parses `openchat://invite/<code>` and `https://<host>/invite/<code>`) + `buildInviteLink()`. Full error taxonomy: malformed, wrong_scheme, empty_code. |
| `apps/mobile/src/features/shell/screens/ShellScreen.tsx:126-145` | Deep-link listener: `Linking.getInitialURL()` for cold start + `Linking.addEventListener('url', …)` for warm start. Routes to `InvitePreviewOverlay`. |
| `apps/mobile/src/features/shell/screens/ShellScreen.tsx:681` | "Join server" button in rail — opens `JoinServerOverlay`. |
| `apps/mobile/src/features/shell/screens/ShellScreen.tsx:987-1011` | All three overlays rendered: `InvitePreviewOverlay`, `JoinServerOverlay`, `InviteCreateOverlay`. |
| `apps/mobile/src/features/shell/__tests__/inviteJoinControls.test.tsx` | Unit tests: rail-join-server button exists, invite-create-button visible with CREATE_INVITE permission, hidden without. |
| `apps/mobile/src/domain/__tests__/links.test.ts:31-88` | 9 unit tests for `parseInviteLink`: custom scheme, https, http, malformed, empty_code, wrong_scheme, round-trip. |

### Screen-readiness E2E (partial — does not satisfy criterion)

| File | What it does | Gap |
|------|-------------|-----|
| `apps/mobile/e2e/flows/screen-readiness/invite-preview.yaml` | Opens `openchat://invite/test123` (invalid code), asserts `invite-preview-overlay` visible. | Does NOT accept. Does NOT verify membership. Uses invalid code — only proves the overlay renders. |
| `apps/mobile/e2e/flows/screen-readiness/invite-create.yaml` | Creates invite via UI, asserts `invite-create-overlay` visible. | Single-actor only. No accept. |

## What is missing

A Maestro E2E flow (`apps/mobile/e2e/flows/p3-06-invite-join.yaml` or similar) that:

1. Provision two users: Alice (server owner) and Bob (fresh, not a member).
2. As Alice: create an invite for her server.
3. As Bob (separate emulator/session): open `openchat://invite/<code>` deep link.
4. Verify the `invite-preview-overlay` renders with correct server name and inviter.
5. Tap the Accept button (`testID: invite-accept`).
6. Verify the server appears in Bob's server rail (`testID: rail-server-<name>`).
7. Optional: verify Bob appears in the member list (confirms multi-actor join).

### Why the integration test doesn't satisfy it

`p3-04-invites.spec.ts` is a correct, multi-actor HTTP-level test. It proves the
backend invite lifecycle works. But the acceptance criterion says **"E2E"** —
meaning a Maestro flow on-device exercising the deep-link protocol. The
integration test does not exercise the `Linking.addEventListener('url', …)`
handler, the `parseInviteLink()` → `InvitePreviewOverlay` → accept chain, or any
React Native rendering. These are all exercised individually by unit tests, but
the criterion demands the integrated E2E path.

This is the same pattern flagged in `T4-phase3-signoff.md:36`: "The integration
test correctly proves the full invite lifecycle over HTTP but is not an E2E
Maestro flow."

## Test-world readiness

`tools/seed/seed.mjs` (lines 151-158) already provisions Bob, Carol, and Dave as
server members via the invite-flow. The test world can supply a second user.
Commit `2e94493` added the second-member seed, removing the pre-existing
blocker.

## Work required

- **Kind:** Maestro E2E flow (YAML)
- **File:** `apps/mobile/e2e/flows/p3-06-invite-join.yaml`
- **What it must assert:**
  1. Deep link opens `InvitePreviewOverlay`
  2. Server name and inviter username are correct
  3. Tapping Accept succeeds (no error toast)
  4. Server appears in the joined user's rail
- **Estimated:** <2 hours — all code is built and proven; only the E2E choreography is missing.
- **Prerequisite:** None. Test-world seeding already supports multi-member.

## Cross-reference

- `docs/signoffs/T4-phase3-signoff.md:32` — UNSATISFIED
- `docs/signoffs/T4-phase3-signoff.md:36-37` — detailed finding
- `docs/signoffs/T4-phase3-signoff.md:66-67` — known-not-done, carried forward
