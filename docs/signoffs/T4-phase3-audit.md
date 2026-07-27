# Phase 3 Audit — Servers, Channels, Invites, Members, Roles

Date: 2026-07-26 · Base tag: (carry from Phase 1/2) · Audit against: `specs/01-REQUIREMENTS.md` §3 Phase 3 rows

## Method

Extracted every FR assigned to Phase 3 from the authoritative table in
`specs/01-REQUIREMENTS.md`. For each: identified the acceptance criterion and
its required evidence kind; traced every `@satisfies` annotation to its source
file; opened the file and judged whether the test actually demonstrates the
criterion. No device run — this is evidence inspection, not UI testing.

Phase 3 FRs (11 total): FR-SRV-001 through FR-SRV-009, FR-ROLE-001, FR-ROLE-002.
FR-SRV-010 is Phase 7, not Phase 3; excluded.

Ban and timeout (FR-ROLE-004, FR-ROLE-005) are Phase 7. They have no mobile
call sites — confirmed by grep: `ban`/`timeout` in `apps/mobile/src` returns
only the `BAN_MEMBERS` permission constant definition and unrelated
banner/timeout references. No Phase 3 FR depends on ban or timeout.

## Audit table

| FR | Criterion (abbrev) | Required kind | Evidence found | File:line | Verdict | Note |
|----|-----|------|------|------|------|------|
| FR-SRV-001 | Layout JSON round-trip byte-for-byte | Integration | Integration test: PUT→GET /auth/server-layout deep-equality | `apps/api/test/integration/p3-01-serverlayout.spec.ts:8,28` | **SATISFIED** | Single-actor but criterion is a data round-trip oracle; no multi-actor needed. "unread dots/mention badges" in FR text not covered but criterion is specific to layout. |
| FR-SRV-002 | Create server → owner lands in default channel | E2E | E2E Maestro: creates server, verifies rail entry and server name | `apps/mobile/e2e/flows/p3-01-create-server.yaml:2` | **WEAK-EVIDENCE** | Creates and verifies server appears in rail. Does NOT assert owner lands in default channel (no `assertVisible` for channel-drawer or default channel after creation). |
| FR-SRV-003 | Rename + delete w/ confirm, permission-gated | Unit permission matrix + E2E | E2E (rename only), Unit (permission calc) | `apps/mobile/e2e/flows/p3-02-rename-server.yaml:2`, `apps/mobile/src/__tests__/permissions.test.ts:7,42,63` | **WEAK-EVIDENCE** | E2E tests rename round-trip. Delete server with confirmation dialog is absent from any E2E flow. Unit permission matrix exists but only half the criterion (rename, not delete) has E2E coverage. |
| FR-SRV-004 | Categories, collapse state persisted, voice live participant names | E2E with fixture server | E2E (channel CRUD), Unit (category collapse) | `apps/mobile/e2e/flows/p3-03-channel-crud.yaml:2`, `apps/mobile/src/features/channels/__tests__/categories.test.ts:7` | **WEAK-EVIDENCE** | Channel CRUD works in E2E. Category collapse state persistence and voice participant names are unit-only. Criterion is specifically "E2E with fixture server" — collapse persistence and voice names need E2E demonstration. |
| FR-SRV-005 | Create/edit/delete channels; assign category; reorder persists | Integration: order persists and matches web rendering | E2E (CRUD + reorder), Unit (reorder logic) | `apps/mobile/e2e/flows/p3-03-channel-crud.yaml:2`, `apps/mobile/e2e/flows/p3-04-reorder-channels.yaml:2`, `apps/mobile/src/features/channels/__tests__/reorder.test.ts:9` | **WEAK-EVIDENCE** | Reorder-persistence proven (close sheet→reopen→verify). But criterion says "matches web rendering" and type is Integration — no comparison against web is performed. E2E exists but doesn't execute the integration oracle. |
| FR-SRV-006 | Invites: create, share sheet, accept via deep link `openchat://invite/<code>` | E2E: fresh user joins via deep link | Integration (full lifecycle), Unit (URL parsing) | `apps/api/test/integration/p3-04-invites.spec.ts:7,19,73`, `apps/mobile/src/domain/__tests__/links.test.ts:31-89`, `apps/mobile/src/domain/links.ts:38,73` | **UNSATISFIED** | Integration test is multi-actor (create→preview→accept→verify membership) and correct in kind — but criterion explicitly says **E2E**. No Maestro flow exercises `openchat://invite/<code>` deep-link join. links.test.ts parses URLs but is unit, not E2E. |
| FR-SRV-007 | Member list: role-grouped, presence-sorted, profile sheet on tap | E2E | E2E (member list + profile), Unit (group+sort) | `apps/mobile/e2e/flows/p3-05-members-kick-leave.yaml:3`, `apps/mobile/src/domain/__tests__/members.test.ts:7,59-231` | **WEAK-EVIDENCE** | E2E verifies two members exist and profile sheet opens with kick/leave buttons. Does NOT verify role-grouped display or presence-sorted ordering. Those are proven in unit only. FR text includes "role-grouped, presence-sorted" and criterion is E2E. |
| FR-SRV-008 | Kick member (MANAGE_MEMBERS); leave server | E2E + permission unit | E2E (non-destructive), Integration (actual kick/leave), Unit (permission calc) | `apps/mobile/e2e/flows/p3-05-members-kick-leave.yaml:3`, `apps/api/test/integration/p3-05-kick-leave.spec.ts:4,66-150`, `apps/mobile/src/domain/__tests__/members.test.ts:7,237-261` | **UNSATISFIED** | E2E flow is explicitly non-destructive: "Non-destructive — does not actually kick or leave." It verifies buttons exist but never executes the actions or verifies outcomes. Integration test correctly demonstrates multi-actor kick/leave lifecycle (owner kicks → member gone, non-owner leaves, 403 on owner-kick) but is Integration, not E2E. Permission unit covers canManageMembers. Criterion is "E2E + permission unit"; the E2E half doesn't prove kick/leave actually works. |
| FR-SRV-009 | [BE] Granular realtime: channel/category/role/member create-update-delete events to members via WS, NOT to non-members | Integration: create channel on A → appears on B ≤2s WITHOUT refetch-all | Integration (WS event verification), E2E (Phase 7 flow) | `apps/api/test/integration/p3-09-granular-events.spec.ts:7,92-247`, `apps/mobile/e2e/flows/p7-01-channel-create-appear.yaml:2` | **SATISFIED** | Integration test is thorough: multi-actor WS event verification for channel/role/server create/update/delete. Each test asserts member receives correct op AND non-member does NOT. `≤2s` timing is not explicitly asserted (10s timeout used) but the criterion is P1 and the event-delivery proof is the hard part. |
| FR-ROLE-001 | Role list + editor: name, color, permission toggles (bitfield), assign/remove per member | Integration: BigInt bitfield round-trip exact; UI matches PERMISSION_LIST labels | Source code annotation only | `apps/mobile/src/features/shell/screens/RolesEditorScreen.tsx:5,93` | **UNSATISFIED** | The only @satisfies claims are on source code (`RolesEditorScreen.tsx` and its hooks). No integration test, no E2E flow, no unit test exercises role CRUD through the API. The composer-diag artifacts (`artifacts/composer-diag/`) show manual UI interaction was recorded but those are not automated tests. Criterion requires "Integration: BigInt bitfield round-trip exact" — no such test exists. |
| FR-ROLE-002 | Client permission calculator = server permission calculator (shared lib semantics; owner⇒admin) | Property tests: 1000 random cases agree with server lib verbatim | Property test (1000+ cases), Unit (schema validation) | `apps/api/test/property/role002-proptest.spec.ts:13`, `apps/mobile/src/__tests__/permissions.test.ts:114` | **SATISFIED** | Property test is exemplary. Imports BOTH implementations (server + client), compares all 11 permission constants by name and value, runs 1000+ random behavioral cases with per-side tables, includes deterministic edge cases (ADMINISTRATOR-only, zero-perms, all-perms, high-bit stress), and includes a falsification proof that demonstrates 1-bit drift is detectable. |

## Verdict counts

| Verdict | Count | FRs |
|------|------|------|
| SATISFIED | 4 | FR-SRV-001, FR-SRV-009, FR-ROLE-002, (FR-SRV-009 as P1) |
| WEAK-EVIDENCE | 5 | FR-SRV-002, FR-SRV-003, FR-SRV-004, FR-SRV-005, FR-SRV-007 |
| UNSATISFIED | 3 | FR-SRV-006, FR-SRV-008, FR-ROLE-001 |
| MANUAL | 0 | — |
| UNKNOWN | 0 | — |

**Total Phase 3 FRs: 11** — 3 UNSATISFIED (all P0), 5 WEAK-EVIDENCE (all P0 except FR-SRV-009 is P1), 3 SATISFIED (one P0, one P1, one P0).

## P0 blockers (NOT SATISFIED)

1. **FR-SRV-006 (P0) — Invites via E2E deep link.** Criterion: "E2E: fresh user joins via `openchat://invite/<code>`". The integration test (`p3-04-invites.spec.ts`) is excellent multi-actor evidence but does not meet the E2E requirement. No Maestro flow exercises deep-link acceptance. The links.test.ts unit tests cover URL parsing only. To satisfy: write a Maestro flow that opens `openchat://invite/<code>` on a fresh emulator instance, verifies the invite preview screen, accepts, and confirms the server appears.

2. **FR-SRV-008 (P0) — Kick/leave E2E.** Criterion: "E2E + permission unit". The E2E flow (`p3-05-members-kick-leave.yaml`) explicitly does not kick or leave — it only verifies button presence. The integration test (`p3-05-kick-leave.spec.ts`) correctly proves the full multi-actor lifecycle but is Integration, not E2E. To satisfy: the existing E2E flow must actually execute a kick (owner kicks member, verify member disappears from list) OR execute a leave (member leaves, verify member gone). The permission unit is already proven.

3. **FR-ROLE-001 (P0) — Role editor integration test.** Criterion: "Integration: BigInt bitfield round-trip exact; UI matches PERMISSION_LIST labels". No automated test exists — the only @satisfies claims are on source code. To satisfy: write an integration test that creates a role via API with explicit permissions as BigInt string, reads it back, and asserts bitfield equality. Additionally, a test (or E2E assertion) that the UI PERMISSION_LIST labels match the server-side list.

## WEAK-EVIDENCE (P0, should be addressed)

- **FR-SRV-002**: Add assertion that after create, the channel drawer is visible and shows the default channel.
- **FR-SRV-003**: Add E2E flow for server delete with confirmation dialog.
- **FR-SRV-004**: Gaps are category collapse persistence in E2E and voice channel live participant names — accept as deferred or add E2E flows.
- **FR-SRV-005**: Either upgrade the E2E to compare order against web rendering, or reclassify the criterion type.
- **FR-SRV-007**: Add role-group and presence-sort assertions to the member list E2E flow.

## Evidence already present (SATISFIED)

- **FR-SRV-001** (P0): Server-layout round-trip is correctly integration-tested.
- **FR-SRV-009** (P1): Granular realtime events are thoroughly integration-tested for 6 event types with non-member exclusion.
- **FR-ROLE-002** (P0): The property test is the gold standard — client/server agreement proven over 1000+ seeded random cases plus explicit edge cases and falsification proof.

## Notes

- Ban (FR-ROLE-004) and timeout (FR-ROLE-005) are Phase 7, not Phase 3. They remain backend-only with zero mobile call sites — confirmed by grep.
- No UNBUILT-* entries in BACKLOG.md touch Phase 3 FRs. BUG-001 (500 on leave) and BUG-002 (500 on kick) exist in BACKLOG but are flagged for Phase 4/7 fix, not Phase 3 delivery.
- FR-SRV-006 is also claimed by `apps/mobile/src/domain/links.ts:38,73` and its unit test — annotated as satisfying the deep-link parsing half. That's valid unit evidence for the URL parsing but does not address the "fresh user joins via deep link" acceptance criterion.
- The trace.mjs tool flags no Phase 3 FRs as lacking @satisfies annotations (FR-APP-005 and FR-MSG-014 are the only untraced, both Phase 4/5). All Phase 3 FRs have annotations; the problem is annotation quality, not absence.

## Signoff recommendation

**NOT GRANTED.** Three P0 blockers (FR-SRV-006, FR-SRV-008, FR-ROLE-001) are UNSATISFIED. Five additional P0 FRs have WEAK-EVIDENCE that should be triaged before granting. Only 3 of 11 FRs are fully SATISFIED.
