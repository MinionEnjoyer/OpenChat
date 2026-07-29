# FR-AUTH-006 Investigation

**Date:** 2026-07-26
**Status:** Case A — BUILT + UNTESTED

## Verdict: A. BUILT + UNTESTED

Both the server endpoint and the client UI exist and are fully implemented.
No E2E acceptance test exists, and the one `@satisfies` annotation points at a
unit test with mocked fetch — it cannot demonstrate the criterion.

## Requirement (specs/01-REQUIREMENTS.md:43)

| Field | Value |
|-------|-------|
| ID | FR-AUTH-006 |
| Requirement | Profile edit: username, display name, avatar (avatar upload depends FR-MED-020) |
| Acceptance criterion | E2E: change display name → visible in a message from a second client |
| Priority | P0 |
| Phase | 1 / 5 |

## Server side — BUILT

### Endpoint
- `PATCH /api/auth/me` — `apps/api/src/auth/auth.controller.ts:178-190`
- Guarded by `AuthGuard` (bearer token required).
- Accepts `{ username?, displayName?, avatarUrl?, status? }`.
- Input sanitization: username sliced to 32 chars, displayName to 80, avatarUrl to 1000.

### Service layer
- `authService.updateProfile()` — `apps/api/src/auth/auth.service.ts:201-232`
- Full validation:
  - Status must be one of `ONLINE | AWAY | DND | INVISIBLE | OFFLINE`
  - Username must match `/^[a-zA-Z0-9_.-]{3,32}$/`
  - Username uniqueness enforced case-insensitively (409 ConflictException if taken)
- Writes to Prisma `user` table; returns sanitized user (no `authSub`).

### Message serialization includes displayName
- `serializeMessage()` — `apps/api/src/messages/messages.service.ts:753`
- Every message emitted via Redis/WS includes `author.displayName`.

### Existing server tests
- Contract schema validation: `apps/api/test/contract/provider.spec.ts:202,312`
  — validates `PATCH /auth/me` response shape against User schema.
- Integration (status changes): `apps/api/test/integration/p4-03-presence.spec.ts:34-87`
  — PATCH status=INVISIBLE/DND/AWAY/ONLINE, verify via GET /auth/me.
- Integration (avatar): `apps/api/test/integration/p5-05-avatar-server-icon.spec.ts:80-120`
  — upload → PATCH avatarUrl → verify GET.

## Client side — BUILT

### Store
- `useSession().updateProfile()` — `apps/mobile/src/stores/session.ts:125-137`
- Optimistic update: immediately sets local user state, then calls `PATCH /auth/me`.
- On failure: rolls back to previous state and rethrows for caller to toast.

### UI (ShellScreen)
- Display name edit: `apps/mobile/src/features/shell/screens/ShellScreen.tsx:322-332`
  - `saveDisplayName()`: trims draft, calls `updateProfile({ displayName })`, shows toast.
- Status picker: `apps/mobile/src/features/shell/screens/ShellScreen.tsx:334-351`
  - `handleStatusUpdate()`: calls `updateProfile({ status })` with debounce guard.
- Avatar upload: `apps/mobile/src/features/shell/screens/ShellScreen.tsx:353-362`
  - `handleAvatarPick()`: uploads, then calls `updateProfile({ avatarUrl })`.

### Existing client test
- `apps/mobile/src/stores/__tests__/profile.test.ts:19-28`
  - Tagged `@satisfies FR-AUTH-006`.
  - Tests optimistic update (mocked `global.fetch` returns 200) and rollback (mocked 500).
  - **Does not exercise the criterion** — no second client, no message visibility, mocked fetch.

## What's missing

| Gap | Detail |
|-----|--------|
| Required evidence kind | **E2E** (explicit in criterion) |
| Existing evidence kind | **Unit** (mocked fetch, single-process) |
| Missing scenario | Two-client flow: client A edits display name → client B sees it in a message |
| Missing assertion | Changed display name is rendered in a message authored by client A on client B |

### Why the existing unit test is insufficient

The unit test proves the store's optimistic-update mechanism works in isolation.
It does not prove:

1. The server processes the `PATCH` and persists the change to the database.
2. Subsequent messages from that user include the new display name.
3. A second client subscribed to the same channel renders the updated name.
4. The WebSocket fan-out delivers the profile change or the message with the author's current profile.

The mocked `global.fetch` returns a hand-crafted JSON response — no real server,
no real database, no real WebSocket, no second client.

## Why this is NOT UNBUILT

Unlike FR-AUTH-001 (case B: client PKCE flow unbuilt), both halves of
FR-AUTH-006 are complete:

- Server: `PATCH /auth/me` exists, validated, contract-tested, integration-tested.
- Client: `updateProfile()` exists, UI wires it up, unit test covers optimistic/rollback.
- Data plumbing: messages serialize `displayName` from the user record, so a
  profile edit changes what future messages show.

The missing piece is the **two-device E2E test**, not any code.

## Required work

An E2E test that:

1. Provisions two users (A and B) in a shared channel via test-world.
2. A edits their display name (via the profile UI, not a raw API call).
3. A sends a message in the shared channel.
4. B's client sees the message with A's **new** display name.

Kind: Maestro E2E flow.
Must assert: the author display name rendered on B's screen matches A's edited value.

Phase 1 E2E already uses Maestro flows (e.g., `p1-01-devlogin-shell.yaml`,
`p1-02-session-restore.yaml`). This test belongs in the same directory
(`apps/mobile/e2e/flows/`). The `e2e-provision.sh` tool already creates
two-participant test worlds (see `docs/E2E-TWO-PARTICIPANT.md`).
