# Phase 3 Signoff — Servers, Channels, Invites, Members, Roles

Date: 2026-07-26 · Base tag: (Phase 2 signoff) · New tag: **NOT GRANTED**
Work items: P3-01 … P3-09 · HEAD at signoff: `92bb88c`

## Deterministic gates

Not run. This is a desk audit of evidence claims against acceptance criteria — no
device, no emulator. The `devctl verify` and `devctl e2e` gates are deferred to
the rev that clears the blockers below.

### `devctl trace check --phase 3`

```
Phase 3: 2 requirement(s) lack @satisfies annotation: FR-APP-005, FR-MSG-014
```

Neither is a Phase 3 FR. All 11 Phase 3 FRs have `@satisfies` annotations. The
problem exposed by this audit is annotation quality, not coverage gaps visible
to the trace tool.

## Judgment gates

### Audit: 11 FRs, 3 UNSATISFIED (all P0)

The full audit is in [T4-phase3-audit.md](./T4-phase3-audit.md). Summary:

| Verdict | Count | P0 | P1 |
|------|------|-----|-----|
| SATISFIED | 4 | FR-SRV-001, FR-ROLE-002 | FR-SRV-009 |
| WEAK-EVIDENCE | 5 | FR-SRV-002, FR-SRV-003, FR-SRV-004, FR-SRV-005, FR-SRV-007 | — |
| UNSATISFIED | 3 | FR-SRV-006, FR-SRV-008, FR-ROLE-001 | — |

### P0 blockers

1. **FR-SRV-006 — No E2E for invite deep-link join.** Criterion explicitly says "E2E: fresh user joins via `openchat://invite/<code>`". The integration test (`p3-04-invites.spec.ts`) correctly proves the full invite lifecycle (create→preview→accept→verify membership) over HTTP but is not an E2E Maestro flow. No flow exercises the deep-link protocol. The `links.ts` unit tests cover URL parsing only.

2. **FR-SRV-008 — E2E for kick/leave is non-destructive.** Criterion requires "E2E + permission unit". The E2E flow (`p3-05-members-kick-leave.yaml`) explicitly does not execute kick or leave — it only verifies button presence on the profile sheet. The integration test (`p3-05-kick-leave.spec.ts`) correctly proves the full multi-actor lifecycle but is Integration, not E2E. The E2E half of the criterion is not satisfied.

3. **FR-ROLE-001 — No test evidence for role editor.** Criterion requires "Integration: BigInt bitfield round-trip exact; UI matches PERMISSION_LIST labels". The only `@satisfies` claims are on source code (`RolesEditorScreen.tsx` and its hooks). No integration test, no E2E flow, no unit test exercises role CRUD. The composer-diag artifacts show manual UI interaction was recorded but those are not automated tests and cannot serve as gate evidence.

### WEAK-EVIDENCE (P0 gaps)

- **FR-SRV-002** — E2E creates server but doesn't assert owner lands in default channel.
- **FR-SRV-003** — E2E covers rename but not delete with confirmation.
- **FR-SRV-004** — Category collapse persistence and voice participant names are unit-only, not E2E.
- **FR-SRV-005** — Reorder persistence proven but "matches web rendering" oracle not exercised.
- **FR-SRV-007** — Member list exists in E2E but role-grouped/presence-sorted display not verified.

### What is solid

- **FR-ROLE-002** — The property test is the gold standard. It imports both client and server
  permission libraries, compares all 11 constants by name and value, runs 1000+ random behavioral
  cases with per-side BigInt tables, and includes a falsification proof. This is the model for
  how every cross-stack FR should be proven.
- **FR-SRV-001** — Server-layout round-trip is correctly integration-tested.
- **FR-SRV-009** — Granular guild-structure realtime events are thoroughly integration-tested
  (6 event types, member inclusion + non-member exclusion per event). The `≤2s` timing assertion
  is not enforced but the hard part (correct op + correct recipients) is proven.
- **FR-SRV-008 integration test** — The backend kick/leave lifecycle (owner kicks → member gone,
  non-owner leaves, 403 on owner-kick, 403 on kicking owner) is correctly multi-actor
  integration-tested. The gap is that no E2E flow actually executes these on-device.

## Known-not-done, carried into next phase

- **Invite deep-link E2E** (FR-SRV-006): needs a Maestro flow that opens `openchat://invite/<code>`
  from a fresh emulator, verifies the preview screen, accepts, and confirms the server appears.
- **Kick/leave E2E** (FR-SRV-008): the existing flow must be upgraded from non-destructive
  button-verification to actually executing kick and leave operations with outcome verification.
- **Role editor integration test** (FR-ROLE-001): needs an integration or E2E test proving
  BigInt bitfield round-trip through the role CRUD API, plus UI-label parity validation.
- **WEAK-EVIDENCE items**: four P0 FRs have gaps that should be triaged — either add the missing
  E2E assertions or reclassify their acceptance criteria.

## Deviations from spec

None this phase. No Decision Records were created. The signoff cannot be granted
due to three P0 UNSATISFIED findings, so deviations have not been formalized.

## Product-owner note

The backend integration test suite for Phase 3 is strong: server-layout round-trip,
granular realtime events with non-member exclusion, full invite lifecycle, and
kick/leave with permission enforcement all work correctly. The `@satisfies`
annotations create a misleading picture of completeness — 11/11 FRs are annotated
but only 4/11 are actually SATISFIED.

The gap pattern is consistent: backend integration tests are mis-annotated as
satisfying E2E criteria. FR-SRV-006 and FR-SRV-008 both have correct multi-actor
integration tests that are the wrong evidence kind for their acceptance criteria.
FR-ROLE-001 has no test evidence at all — the annotation is on source code.

The three blockers are narrow and fixable: one E2E flow (invite deep link), one
E2E upgrade (destructive kick/leave), and one integration test (role editor
bitfield round-trip). Estimated <1 day of focused test writing.
