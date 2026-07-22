# 13 — PHASE 4: Social — Friends, DMs, Presence, Inbox

Goal: the social graph and private messaging reach parity; presence is live everywhere.
FRs: SOC-001..007, AUTH-007, MSG suite inherited by DM channels. Out of scope: DM voice/video
calls (Phase 6 — but the `call.ring` op handler installed here shows a "calls arrive in a
later update" toast so nothing is silently dropped) · media in DMs beyond Phase-2 behavior.

## Work items

**P4-01 Friends feature** — tabs online/all/pending/blocked; add by username or friendCode
(single input, server disambiguates per characterization); accept/decline/cancel; remove;
block/unblock; every transition optimistic with rollback-on-error toast (FR-SOC-001,
APP-006). Tests: integration drives the full `FriendStatus` state machine both directions
between alice/bob; RTL ×4 states per tab.
**Corrected 2026-07-21 (P0-10):** `GET /api/friends/requests` returns `{incoming, outgoing}`
(not a bare array). This was observed during contract/provider testing and confirmed by the
ajv suite (36/36 with `additionalProperties:false`). The incoming-tab renders from
`res.incoming`, the outgoing-tab from `res.outgoing`. See `contracts/CHANGELOG.md` P0-10.

**P4-02 DM & group DM channels** — DM list (activity sort, unread badges), open-DM from
profile sheet/friends list (`POST /dms` idempotency per characterization), group DM create
(2..10) + rename + add/remove per server rules; the ENTIRE Phase-2 message feature set must
work unmodified in DM channels — proven by re-running the tagged `@dm-generic` subset of
Phase-2 Maestro flows against a DM fixture (FR-SOC-002/003). Any Phase-2 code that special-
cased server channels is a defect to fix here, not to fork.

**P4-03 Presence everywhere** — presence map store fed by global `presence` op; dots on
rail? (no — Discord parity: dots on members/friends/DM avatars); own status picker
online/idle/dnd/invisible sending `presence.update`, persisted via `PATCH /me` status per
characterization (FR-SOC-004, AUTH-007). Integration: ≤2s propagation; invisible reads as
offline to peers (verify server semantics in Phase 0 E-note; if server lacks invisible
masking, [BE] add it — additive, characterization-gated).

**P4-04 Notifications inbox** — `GET /notifications` returns `{friendRequests, serverInvites, count}`
(not a bare array). `friendRequests` and `serverInvites` are arrays; `count` is the total.
This shape was observed during contract/provider testing and confirmed by the ajv suite
(36/36 with `additionalProperties:false`). Invitation accept/decline wiring triggers `notify`
refresh; badge on inbox icon (FR-SOC-005). E2E: web user invites mobile user → accept →
server appears without restart. See `contracts/CHANGELOG.md` P0-10.

**P4-05 Profile sheet v2** — avatar, status, mutual servers (client-computed from cached
servers/members), actions: Message / Add-remove friend / Block (FR-SOC-006); blocked message
collapse in all lists (FR-SOC-007, unit-tested in message renderer).

**P4-06 Audit & refactor + signoff.** Demo: two devices — friend request lifecycle → DM with
reactions/replies → group DM of 3 (third = web client) → block/collapse → invisible mode →
invite-accept from inbox.
Gates: standard + `@dm-generic` re-run green + trace check.
