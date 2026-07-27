# FR-SRV-008 Investigation — Kick Member / Leave Server

**Verdict: A — BUILT, E2E non-destructive (test gap, not an unbuilt gap)**

The code fully exists on both API and mobile sides. A multi-actor integration test proves the server lifecycle. The E2E verifies UI presence but is explicitly non-destructive — it does not execute kick or leave and does not verify state changes. The Phase 3 audit is correct: the E2E half of the criterion ("E2E + permission unit") is not satisfied.

## Requirement

| ID | Requirement | Criterion | Priority | Phase |
|----|-------------|-----------|----------|-------|
| FR-SRV-008 | Kick member (MANAGE_MEMBERS); leave server | E2E + permission unit | P0 | 3 |

## Evidence — what exists

### API (SERVER) — fully built

| Endpoint | Controller | Service | Permission | Audit | Realtime |
|----------|-----------|---------|------------|-------|----------|
| `DELETE /servers/:id/members/:userId` (kick) | `servers.controller.ts:192-199` | `servers.service.ts:620-644` | `MANAGE_MEMBERS` gate (line 621) | `KICK` entry (line 633) | `member.kicked` (line 641) |
| `DELETE /servers/:id/members/me` (leave) | `servers.controller.ts:187-190` | `servers.service.ts:863-887` | Owner cannot leave guard (line 869) | `MEMBER_LEAVE` entry (line 878) | `member.left` (line 886) |

Both endpoints are defined in `contracts/openapi.yaml:688-721` with `x-evidence` annotations. Gateway events are defined in `contracts/gateway-events.yaml:618,635` and implemented in `events.gateway.ts:358-365`.

### MOBILE CLIENT — fully built

| Action | Location | Confirmation | API Call |
|--------|----------|-------------|----------|
| Kick | `ShellScreen.tsx:827-837` | `Alert.alert` with "Kick this member?" | `DELETE /servers/${serverId}/members/${userId}` (line 833) |
| Leave | `ShellScreen.tsx:842-851` | `Alert.alert` with "Leave this server?" | `DELETE /servers/${serverId}/members/me` (line 848) |

- `MemberProfileSheet.tsx:67-69` — shows Kick button on other members' profiles (gated by `canKick`).
- `MemberProfileSheet.tsx:81-83` — shows Leave button on own profile.
- `MemberList.tsx:23` — comment: "Kick/leave actions gated by permissions (FR-SRV-008)".
- `permissions.ts:14` — `MANAGE_MEMBERS` bit defined.
- Strings defined in `ui/strings.ts:316-321`.

### INTEGRATION TESTS — multi-actor, substantive

`apps/api/test/integration/p3-05-kick-leave.spec.ts` — 3 actors (owner, target, bystander), 5 test cases:

1. **Owner can kick a member and they are actually gone** (line 67) — creates server, invites target, verifies target is member, kicks target, verifies target is absent from member list. Two-actor: ✅.
2. **Non-privileged user gets 403 when trying to kick** (line 94) — bystander attempts kick → 403.
3. **Owner cannot leave own server** (line 105) — owner attempts leave → 403.
4. **Non-owner member can leave server** (line 115) — target joins second server, leaves → 200.
5. **Cannot kick the server owner** (line 151) — kick attempt against owner → not 200.

### MOBILE E2E — non-destructive

`apps/mobile/e2e/flows/p3-05-members-kick-leave.yaml` — line 10 states: "Non-destructive — does not actually kick or leave."

What it does:
- Opens member list, verifies test user + friend appear
- Taps friend → asserts `member-profile-kick` button is visible
- Taps self → asserts `member-profile-leave` button is visible, `member-profile-kick` is NOT visible

What it does NOT do:
- Execute a kick and verify the target disappears from the member list
- Execute a leave and verify the member is gone
- Verify any server-side state change at all

### CONTRACT — defined

`contracts/openapi.yaml:688-721` — both endpoints with response schemas.

### UNIT TESTS — permission calculation

`apps/mobile/src/domain/__tests__/members.test.ts:237-261` — `@satisfies FR-SRV-008`:
- `canManageMembers(id)` — true for owner
- `canManageMembers(id)` — true for member with MANAGE_MEMBERS role
- `canManageMembers(id)` — false for regular member
- `canManageMembers(id)` — false for non-member
- `canManageMembers(id)` — false for banned member

## Gaps identified

### 1. E2E is non-destructive (primary gap — why the audit failed)

The criterion requires "E2E + permission unit." The permission unit is proven by:
- Integration test: `p3-05-kick-leave.spec.ts` (403 for non-privileged, cannot-kick-owner)
- Unit test: `members.test.ts:237-261` (canManageMembers)

The E2E half is NOT proven. The E2E flow only verifies button presence, not the full action + state change. It needs to actually execute kick OR leave and verify post-condition.

### 2. Realtime event handling gap in mobile client (minor)

- The gateway sends `member.left` and `member.kicked` frames (`events.gateway.ts:358-365`).
- The types are defined in `events.d.ts:81-82` (`MemberLeftFrame`, `MemberKickedFrame`).
- `sync/queryClient.ts:applyEvent()` has NO case for `member.left` or `member.kicked` — they fall through to `default: break`.
- Consequence: when a member is kicked or leaves, other clients in the server do NOT auto-remove them from the member list. Only a manual refresh or navigation will pick up the change.

### 3. BUG-001 / BUG-002 — characterization tests still accept [200,500]

- `characterization/servers.spec.ts:111` (leave): `expect([200, 500]).toContain(res.status)`
- `characterization/servers.spec.ts:121` (kick): `expect([200, 500]).toContain(res.status)`
- The integration test asserts exact 200, suggesting the 500 may be fixed in the integration test path but the characterization path may differ (or the characterization was never updated after the fix).
- These are logged as BUG-001 and BUG-002 in BACKLOG.md.

## Audit trail

The Phase 3 audit (`docs/signoffs/T4-phase3-audit.md:32`) correctly diagnosed this:

> E2E flow is explicitly non-destructive: "Non-destructive — does not actually kick or leave." It verifies buttons exist but never executes the actions or verifies outcomes. Integration test correctly demonstrates multi-actor kick/leave lifecycle but is Integration, not E2E. Criterion is "E2E + permission unit"; the E2E half doesn't prove kick/leave actually works.

The signoff (`docs/signoffs/T4-phase3-signoff.md:38`) concurs:

> FR-SRV-008 — E2E for kick/leave is non-destructive. Criterion requires "E2E + permission unit". The E2E flow explicitly does not execute kick or leave — it only verifies button presence on the profile sheet.

## Work required to close

1. **Upgrade the E2E flow to actually execute kick or leave** (`apps/mobile/e2e/flows/p3-05-members-kick-leave.yaml`):
   - Provision a test world with a friend member (already seeded by `test-world.service.ts:72-74`, commit 2e94493).
   - Tap friend → tap Kick → confirm → verify friend disappears from member list.
   - OR: invite a second user, have them leave, verify they disappear from member list.

2. **Add realtime event handlers** in `sync/queryClient.ts:26-91`:
   - Add `case 'member.left':` — invalidate members query or remove the user from query cache.
   - Add `case 'member.kicked':` — same.

3. **Verify BUG-001/BUG-002 status** — check whether characterization tests still sometimes return 500. If the 500 has been fixed, tighten the characterization tests to assert exact 200 and remove the BUG entries from BACKLOG.md per the P0-04 remediation protocol.
