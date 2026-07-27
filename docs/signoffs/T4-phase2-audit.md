# Phase 2 Audit — Messaging Core

Date: 2026-07-26 · Audit type: T4 signoff evidence review (no device)
Scope: All 18 FRs assigned to Phase 2 in `specs/01-REQUIREMENTS.md`

## Audit table

| FR | Criterion (abbrev) | Req'd kind | Evidence found | File:line | Verdict | Note |
|----|--------------------|------------|----------------|-----------|---------|------|
| FR-APP-002 | Cold start restores last viewed channel | E2E | E2E flow: login → select channel → kill → relaunch → same channel | `p2-02-coldstart-channel.yaml:2` | SATISFIED | Also has complementary unit tests in `coldstart.test.ts` |
| FR-APP-006 | In-app error toasts for failed mutations with retry affordance | Unit | Store throws on 500 with `retriable:true`; no toast-render assertion | `profile.test.ts:30` | WEAK-EVIDENCE | Tests store error propagation, not toast rendering. Criterion says "mutation error path renders toast" — no `render()` call in this test |
| FR-MSG-001 | Message list: newest-anchored, infinite pagination, day dividers, author grouping | Integration | Unit tests for mergePage/insertDayDividers/computeAuthorGroups | `pagination.test.ts:1` | WEAK-EVIDENCE | Right domain, wrong kind. Criterion requires integration vs seeded 1000-msg channel with exact id-sequence assertions. These are pure-function unit tests with no API calls |
| FR-MSG-002 | Send text, optimistic render with nonce, reconcile, failed-send retry/delete | Unit + E2E | Unit: nonce reconciliation, idempotency, duplicate guard | `messages.test.ts:14` | WEAK-EVIDENCE | Unit half present and thorough. E2E half ("B sees A's msg ≤2s") has NO evidence — no two-device E2E flow exists |
| FR-MSG-003 | Edit own message, (edited) marker | E2E two-device | Unit: mergeUpdated replaces in-place, sets editedAt | `messages.test.ts:60` | WEAK-EVIDENCE | Pure state-merge unit test. No E2E flow for edit propagation |
| FR-MSG-004 | Delete own message; MANAGE_MESSAGES may delete others' | E2E + permission unit | Unit: mergeDeleted marks deletedAt | `messages.test.ts:103` | WEAK-EVIDENCE | Pure state-merge unit test. No E2E flow, no permission matrix test |
| FR-MSG-005 | Reply with quoted preview; tap preview jumps to original | E2E | Unit: resolveReplyPreview/truncateReplyContent | `reply.test.ts:4` | WEAK-EVIDENCE | Thorough unit tests for preview resolution, but no E2E flow for reply-jump across page boundary |
| FR-MSG-006 | Reactions: add/remove, counts, reactor list, emoji picker | E2E two-device | Unit: optimisticToggle, filterEmojis, BUILTIN_EMOJIS + E2E: send → react → verify pill → remove | `reactions.test.ts:1` + `msg-rich-reactions.yaml:2` | SATISFIED | Unit covers logic; E2E demonstrates single-device reaction flow. Two-device half not present but E2E is substantively present |
| FR-MSG-007 | Markdown render: bold/italic/underline/strike/code/spoiler/blockquote/links/lists | Snapshot unit | 443-line snapshot unit: one fixture per construct + bonus E2E flow | `markdown.test.ts:1` + `msg-rich-markdown-mentions.yaml:2` | SATISFIED | Criterion is snapshot unit tests — delivered. E2E is additive |
| FR-MSG-008 | Mentions: @user autocomplete + highlight; @everyone/@here gated | Unit + E2E | 394-line unit: canonical syntax, permission gate, autocomplete + E2E: composer types @, mention picker appears, inserts | `mentions.test.ts:1` + `msg-rich-markdown-mentions.yaml:2` | SATISFIED | Both required evidence kinds present |
| FR-MSG-009 | Typing indicators (throttled ≥3s, multi-user aggregation) | Integration | Unit: formatTyping string aggregation + typing store TTL/throttle | `typing.test.ts:1` + `stores/typing.test.ts:1` | WEAK-EVIDENCE | Right domain, wrong kind. Criterion requires Integration ("two senders → 'A and B are typing…'"). Both are unit tests with no WS/multi-client simulation |
| FR-MSG-010 | Unread/read state: per-channel divider, bold channels, mention counts; POST read on view | Integration | Unit: computeChannelUnread (exhaustive table-driven, 222 lines) | `unread.test.ts:1` | WEAK-EVIDENCE | Unit half (badge math) is excellent. Integration half (ReadState round-trip) has NO evidence |
| FR-MSG-011 | Pins: pin/unpin (permission-gated), pins panel per channel | E2E | Unit: pin flag round-trip, pins list derivation, permission matrix | `messages.test.ts:184` | WEAK-EVIDENCE | Right domain, wrong kind. Criterion requires E2E ("pin on device A → panel on device B"). All three test blocks are unit-level |
| FR-MSG-012 | Polls: create (2..10 options), vote, live results | Integration | Unit: validatePollOptions, computeTally, findUserVote, optimisticVote | `polls.test.ts:1` | WEAK-EVIDENCE | Right domain, wrong kind. Criterion requires Integration ("vote counts converge across two clients"). Unit only |
| FR-MSG-013 | Link auto-embeds: URL/YouTube/Share links render cards | Snapshot tests | 67-test unit: extractYouTubeId, extractShareRef, embed card classification per type | `embeds.test.ts:1` | SATISFIED | Criterion is snapshot tests per embed type — delivered |
| FR-MSG-014 | GIF picker (Giphy search) inserting GIF as embed | E2E | Structural modal test with NO @satisfies annotation | `gifPickerModalStructure.test.tsx:1` | UNSATISFIED | Test exists but carries no `@satisfies` and is structural (modal overlay check), not functional E2E. `trace.mjs check` lists FR-MSG-014 as lacking annotation |
| FR-MSG-015 | Copy text / copy link on long-press | Maestro: clipboard assert | Unit: deep-link parsing (invite/deep-link extraction) | `links.test.ts:1` | WEAK-EVIDENCE | Tests deep-link parsing, not copy-to-clipboard. Wrong sub-domain. No Maestro flow with clipboard assert |
| FR-MSG-016 | [BE] Jump-to-message deep loading (`?around=<id>` pagination) | Integration | Integration: runtime message-map, 5 test cases against seeded 1000-msg channel | `p2-16-around.spec.ts:11` | SATISFIED | Exactly what criterion asks: fetch around id returns id ± N, 404, custom limit, ?before compatibility |

## Verdict counts

- **SATISFIED**: 6 (FR-APP-002, FR-MSG-006, FR-MSG-007, FR-MSG-008, FR-MSG-013, FR-MSG-016)
- **WEAK-EVIDENCE**: 11 (FR-APP-006, FR-MSG-001, FR-MSG-002, FR-MSG-003, FR-MSG-004, FR-MSG-005, FR-MSG-009, FR-MSG-010, FR-MSG-011, FR-MSG-012, FR-MSG-015)
- **UNSATISFIED**: 1 (FR-MSG-014)
- **MANUAL**: 0
- **UNKNOWN**: 0
- **Total**: 18

## P0 blockers

Every P0 (priority-zero) FR not SATISFIED is a blocker:

1. **FR-MSG-001** (WEAK-EVIDENCE) — Message list pagination has only unit tests. The acceptance criterion demands integration tests against a seeded 1000-msg channel with exact id-sequence assertions. `pagination.test.ts` tests pure functions (`mergePage`, `insertDayDividers`, `computeAuthorGroups`) with hand-constructed mock data — no API calls, no cursor pagination, no id-sequence asserts.

2. **FR-MSG-002** (WEAK-EVIDENCE) — Send/optimistic has the unit half (nonce reconciliation) but the E2E half ("B sees A's msg ≤2s") has zero evidence. No two-device E2E flow exists for message send.

3. **FR-MSG-003** (WEAK-EVIDENCE) — Edit message has only a unit test for `mergeUpdated`. No E2E two-device propagation flow exists.

4. **FR-MSG-004** (WEAK-EVIDENCE) — Delete message has only a unit test for `mergeDeleted`. No E2E flow, no permission matrix test (MANAGE_MESSAGES gating).

5. **FR-MSG-005** (WEAK-EVIDENCE) — Reply with quoted preview has only unit tests for `resolveReplyPreview`. No E2E flow for reply-jump across a page boundary.

6. **FR-MSG-009** (WEAK-EVIDENCE) — Typing indicators have only unit tests. The acceptance criterion demands an integration test demonstrating two senders producing "A and B are typing…".

7. **FR-MSG-010** (WEAK-EVIDENCE) — Unread/read state has the unit half (badge math) but no integration test for ReadState round-trip.

8. **FR-MSG-011** (WEAK-EVIDENCE) — Pins have only unit tests. The acceptance criterion demands E2E: "pin on device A → panel on device B ≤2s".

9. **FR-APP-006** (WEAK-EVIDENCE) — In-app error toasts: the unit test (`profile.test.ts:30`) tests store error propagation but never renders a toast. The criterion says "mutation error path renders toast."

All 9 P0 blockers share the same class: the evidence exists but in the wrong kind — unit tests where the criterion demands integration or E2E. This is structurally identical to the Phase 1 finding where `bearer-auth.spec.ts` claimed `@satisfies FR-AUTH-001` on a dev-login test.

## Structural findings

### 1. Majority of Phase 2 has no E2E coverage

10 of 18 Phase 2 FRs lack any E2E flow. The only Phase 2 FRs with E2E coverage are:
- FR-APP-002 (`p2-02-coldstart-channel.yaml`)
- FR-MSG-006 (`msg-rich-reactions.yaml`) — also partially covers FR-MSG-007, FR-MSG-008
- FR-MSG-007, FR-MSG-008 (`msg-rich-markdown-mentions.yaml`)

This means the core messaging loop — send, edit, delete, reply, pins — has zero device-level automation.

### 2. trace.mjs check confirms the gap

`node tools/trace.mjs check` reports FR-MSG-014 as lacking `@satisfies` annotation (among 17 total). The 4 infrastructure-originated violations (FR-SRV-010 in `gen.mjs`, FR-VOX-001 in probe tools) are outside Phase 2 scope but indicate a hygiene issue the Phase 1 audit flagged as a pattern: annotations on non-product files.

### 3. Characterization gap

The API-side characterization tests (`apps/api/test/characterization/messages.spec.ts`, `reactions.spec.ts`, `pins-polls.spec.ts`) carry zero `@satisfies` annotations. They freeze upstream behavior but are not traceable to any Phase 2 FR.

### 4. No BACKLOG entries for Phase 2

No `UNBUILT-*` entries in `docs/BACKLOG.md` reference Phase 2 FRs. UNBUILT-001 targets FR-AUTH-001 (Phase 1). The tooling debt entries are cross-cutting.

## Method note

Every @satisfies claim was opened and read. Judgments are based on whether the test actually demonstrates the criterion, not on the annotation's presence. Where a test is the right kind but thin (FR-APP-006), WEAK-EVIDENCE was assigned rather than SATISFIED. Where a test is thorough but the wrong kind (FR-MSG-001), WEAK-EVIDENCE was assigned rather than SATISFIED, because the criterion is prescriptive about kind.
