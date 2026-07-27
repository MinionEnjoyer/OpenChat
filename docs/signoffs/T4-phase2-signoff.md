# Phase 2 Signoff — Messaging Core

Date: 2026-07-26 · Base tag: `phase0-signoff` · New tag: (not granted)
Work items: messaging core FRs · HEAD at signoff: `92bb88c`

## Verdict: NOT GRANTED

Phase 2 cannot be signed off. 9 of 12 P0 requirements lack adequate evidence and
1 P1 requirement (FR-MSG-014) is entirely UNSATISFIED. The full audit is in
`docs/signoffs/T4-phase2-audit.md`.

## Deterministic gates

No device was connected for this audit. The following gates were not exercised
and must be run before a signoff can be granted:

- `devctl verify` — not run
- `devctl e2e` — not run (suites exercising Phase 2 E2E flows)
- `devctl trace check --phase 2` — not run
- `devctl nfr` — not run

These gates are deferred to the re-audit that follows resolution of the blockers
below.

## Evidence summary

| Verdict | Count | FRs |
|---------|-------|-----|
| SATISFIED | 6 | FR-APP-002, FR-MSG-006, FR-MSG-007, FR-MSG-008, FR-MSG-013, FR-MSG-016 |
| WEAK-EVIDENCE | 11 | FR-APP-006, FR-MSG-001, FR-MSG-002, FR-MSG-003, FR-MSG-004, FR-MSG-005, FR-MSG-009, FR-MSG-010, FR-MSG-011, FR-MSG-012, FR-MSG-015 |
| UNSATISFIED | 1 | FR-MSG-014 |
| **Total** | **18** | |

Of the 12 P0 requirements, only 4 are SATISFIED (FR-APP-002, FR-MSG-006,
FR-MSG-007, FR-MSG-008). The remaining 8 P0 requirements plus FR-APP-006 are
WEAK-EVIDENCE — the evidence exists in the wrong kind.

## P0 blockers

Every P0 FR not SATISFIED is a blocker. All 9 share the same structural defect:
unit tests where the acceptance criterion demands integration or E2E.

1. **FR-MSG-001** — Message list pagination requires integration vs seeded
   1000-msg channel. Evidence is `pagination.test.ts` (unit, pure functions,
   no API calls).

2. **FR-MSG-002** — Send/optimistic has the unit half (nonce reconciliation)
   but the E2E half ("B sees A's msg ≤2s") has zero evidence. No two-device
   E2E flow exists.

3. **FR-MSG-003** — Edit message requires E2E two-device propagation.
   Evidence is only a unit test for `mergeUpdated`.

4. **FR-MSG-004** — Delete message requires E2E + permission unit tests.
   Evidence is only a unit test for `mergeDeleted`.

5. **FR-MSG-005** — Reply with quoted preview requires E2E jump across page
   boundary. Evidence is only unit tests for `resolveReplyPreview`.

6. **FR-MSG-009** — Typing indicators require Integration ("two senders →
   'A and B are typing…'"). Evidence is two unit tests (formatTyping string
   formatting + TTL/throttle store tests).

7. **FR-MSG-010** — Unread/read state requires Integration (ReadState
   round-trip). Unit half (badge math) is excellent but integration half has
   zero evidence.

8. **FR-MSG-011** — Pins require E2E ("pin on device A → panel on device B
   ≤2s"). Evidence is unit tests for pin flag round-trip, list derivation,
   and permission matrix — no E2E flow.

9. **FR-APP-006** — In-app error toasts require a unit test demonstrating
   "mutation error path renders toast." The existing test asserts that the
   store throws `{ status: 500, retriable: true }` but never calls `render()`
   to prove a toast appears. Thin, not wrong-kind — the existing test can be
   upgraded to SATISFIED by adding a render assertion.

## Structural findings

### Evidence-kind mismatch is the dominant pattern

10 of 18 Phase 2 FRs have NO E2E coverage of any kind. The core messaging loop
— send, edit, delete, reply, pins — has zero device-level automation. The three
E2E flows that exist (`p2-02-coldstart-channel.yaml`, `msg-rich-reactions.yaml`,
`msg-rich-markdown-mentions.yaml`) cover only FR-APP-002, FR-MSG-006, FR-MSG-007,
and FR-MSG-008.

This is the same class of defect the Phase 1 audit caught: annotations claiming
a requirement that the evidence does not actually demonstrate. In Phase 1,
`bearer-auth.spec.ts` claimed FR-AUTH-001 on a dev-login test. In Phase 2,
`pagination.test.ts` claims FR-MSG-001 on pure-function unit tests against a
criterion demanding integration.

### trace.mjs check signal

`node tools/trace.mjs check` reports FR-MSG-014 as lacking `@satisfies`
annotation. This is the only Phase 2 FR caught by the tool — the remaining
12 FRs without adequate evidence all carry annotations, just the wrong kind
of test behind them. The tool cannot detect the evidence-kind mismatch.

### What IS solid

- **FR-MSG-016** (`p2-16-around.spec.ts`) is exemplary: runtime message-map
  built from the API, exact ID-sequence assertions, boundary cases (msg 1,
  msg 1000, 404, custom limit, ?before compatibility). This is the standard
  the other integration-required FRs should meet.
- **FR-MSG-007** markdown snapshot tests are thorough (443 lines, one fixture
  per construct).
- **FR-MSG-008** mentions tests cover canonical syntax, permission gate,
  autocomplete filtering, and have complementary E2E.
- **FR-MSG-013** embeds tests cover YouTube, Share, image, and GIF card
  classification per type.

## Remediation path

The gap is concentrated: 8 P0 FRs need evidence upgraded from unit to
integration or E2E. The prescription per FR:

- **FR-MSG-001**: Integration test against seeded #volume channel (1000 msgs),
  asserting exact id sequences, no dupes/gaps, day dividers at correct
  boundaries. Model on `p2-16-around.spec.ts`.
- **FR-MSG-002**: E2E two-device flow: A sends → B sees within 2s. Needs
  second emulator or a WS-intercepting test harness.
- **FR-MSG-003**: E2E two-device: A edits → B sees `(edited)` within 2s.
- **FR-MSG-004**: E2E + permission unit: A deletes own, moderator deletes
  another's, non-moderator denied.
- **FR-MSG-005**: E2E: reply across page boundary (reply to msg 50, verify
  jump loads older page correctly).
- **FR-MSG-009**: Integration: two WS clients → typing events → "A and B are
  typing…" visible.
- **FR-MSG-010**: Integration: POST read → ReadState persisted → badge math
  converges.
- **FR-MSG-011**: E2E: pin on device A → pins panel on device B shows it
  within 2s.
- **FR-APP-006**: Add `render()` to the existing profile test to prove toast
  appears, or add a dedicated toast-render unit test.
- **FR-MSG-014**: Add `@satisfies FR-MSG-014` to a functional E2E flow for
  GIF picker search/insert, or admit UNBUILT and remove from Phase 2 scope.

## Known-not-done, carried into re-audit

- **All deterministic gates** (verify, e2e, trace, nfr) were not exercised.
  This is a no-device audit.
- **FR-MSG-014** (GIF picker) is UNSATISFIED — no traceable evidence at all.
  Either build the E2E flow or document as UNBUILT and defer.
- **Two-device E2E infrastructure** does not exist in the current suite.
  FR-MSG-002 through FR-MSG-005 and FR-MSG-011 all require it. This is a
  prerequisite investment before those FRs can be satisfied.

## Deviations from spec

No new Decision Records this phase. The audit is evidence-only; no code was
changed.
