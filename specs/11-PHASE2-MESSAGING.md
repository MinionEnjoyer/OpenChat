# 11 — PHASE 2: Messaging Core

Goal: Discord-grade text chat in any channel the shell can open (server text channels; DMs
inherit automatically in Phase 4). FRs: MSG-001..016 (020 deferred to Phase 7), APP-002,
APP-006, NFR-02/05/06 groundwork.

Out of scope: attachments/uploads and rich media rendering beyond URL text (Phase 5 — but the
attachment data model renders a neutral "file" chip if present, so web-authored messages don't
break) · search · threads · custom emoji.

## Work items

**P2-01 Message data layer** (`sync/messages.ts`, `domain/pagination.ts`)
- Infinite query on `?before` per E6-verified semantics; merge function is a pure,
  property-tested module (inputs: existing pages + fetched page + realtime inserts →
  invariants: sorted, unique ids, no gaps at page joins). `message.created/updated/deleted`
  cache patches incl. the not-loaded-channel case (bump channel activity + unread only).
- Tests: property (fast-check, seeds fixed) + integration walk of `#volume` (FR-MSG-001).

**P2-02 Message list UI** (`features/messages`)
- FlashList inverted; day dividers; author grouping ≤7min; scroll-anchored pagination;
  new-message pill when scrolled up; deleted messages render tombstone; `(edited)` badge.
- Tests: RTL states ×4; Maestro `p2-01-scroll-history` over `#volume`; NFR-02 harness flow
  registered now (budget enforced Phase 8, measured from now — record baseline).

**P2-03 Composer + send pipeline**
- Optimistic send with `nonce` (uuid v4), pending/failed states, tap-retry & delete-failed;
  offline → `stores/outbox` (NFR-06 behavior, capacity toast at 50); Enter-to-send +
  send button; growing input; character cap mirrors server Zod limit (read from contract).
- Tests: unit reconcile-by-nonce incl. out-of-order ack; integration two-client convergence
  ≤2s (FR-MSG-002); airplane-mode E2E `p2-02-offline-outbox` (NFR-06).

**P2-04 Edit & delete** — long-press action sheet, permission-aware (own vs MANAGE_MESSAGES
via shared calculator), inline edit mode. Tests: permission matrix unit; two-device E2E
(FR-MSG-003/004).

**P2-05 Markdown renderer** (`domain/markdown` + `features/messages/Rich`)
- Rule set exactly: bold/italic/underline/strike, inline+block code (mono, no highlight v1),
  spoiler tap-to-reveal, blockquote, links (openable), ordered/unordered lists, escaping.
  Parity oracle: fixture corpus `fixtures/markdown/*.txt` rendered by the WEB client during
  Phase 0 (screenshot + DOM-derived expectations committed) — mobile snapshots must express
  the same structure (FR-MSG-007).
- Tests: snapshot per construct + property no-crash on random strings + linkify edge corpus.

**P2-06 Mentions** — composer autocomplete (members of current context), canonical wire
syntax copied from web (Phase-0 capture of exact token format goes in the contract as
`x-mention-syntax`), render highlight incl. self-mention emphasis, `@everyone/@here` shown
only with MENTION_EVERYONE (FR-MSG-008). `mention` op → unread store + in-app toast.
Tests: parser unit (shared-domain), gate matrix, two-device badge E2E `p2-03-mention-badge`.

**P2-07 Typing** — send `typing.start` throttled (min 3s between sends while input non-empty);
render aggregated line with 5s TTL (FR-MSG-009). Integration with two dev users.

**P2-08 Reactions** — long-press → picker (emoji-mart data set, search); chips with count +
self-highlight; tap chip toggles; reactor list sheet. Sync arrives via `message.updated`
(E7). Two-device E2E `p2-04-reactions` (FR-MSG-006).

**P2-09 Unread & read state** — `domain/unread` wired: divider placement, drawer bolding,
mention counts, rail dots (upgrading P1-06 stub); `POST read` on channel view + on
foreground; APP-002 last-channel restore. Tests: unread math unit table (12 canonical
scenarios), integration ReadState round-trip (FR-MSG-010), E2E relaunch restore.

**P2-10 Pins** — pin/unpin in action sheet (gated MANAGE_MESSAGES per web parity —
Phase-0-verify actual gate and encode in contract), pins panel from `GET pins`
(FR-MSG-011). E2E two-device.

**P2-11 Polls** — create sheet (2..10 options), render with live percentages, vote/toggle per
server rules from characterization. Integration convergence (FR-MSG-012).

**P2-12 Embeds & GIFs** — link-card rendering strategy per E-experiment outcome recorded in
contracts (`x-embed-source: server|client`): implement ONLY that branch. YouTube/Share/plain
URL cards; Giphy picker behind config flag (FR-MSG-013/014). Snapshot tests per card type;
flagged-off test asserts hidden UI.

**P2-13 Message utilities** — copy text/link, jump-to-replied-message with cross-page load;
[BE] add `?around=<id>` param to messages list (additive, contract-first, characterization
for old param untouched) (FR-MSG-005/015/016). Integration: around-fetch exactness; E2E
reply-jump across page boundary.

**P2-14 Audit & refactor + signoff.** Demo: two devices full conversation — send/edit/delete/
reply/react/pin/poll/mention/typing/offline-outbox — plus 1000-msg scroll and relaunch
restore. Gates: standard set + NFR-02 baseline recorded + trace check on this phase's FRs.
