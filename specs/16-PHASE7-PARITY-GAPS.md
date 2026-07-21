# 16 — PHASE 7: Parity Gap Features (closes G5)

Goal: the Discord features the platform lacks server-side. Every item here is contract-first:
schema/migration → contract entry → provider tests → client. All changes additive; web client
must keep working with each item feature-complete OR gracefully inert (unknown fields
ignored — verified per item by web-smoke). Items are independent; execute in listed order but
an escalation on one does not block the next.

FRs: ROLE-003..007, MSG-020, SRV-010. Out of scope: everything in `01 §1`, forum/stage
anything, automod.

**P7-01 [BE+APP] Channel permission overwrites (FR-ROLE-003)** — the big one.
- Prisma: `ChannelOverwrite {channelId, targetType role|member, targetId, allow BigInt,
  deny BigInt}`; endpoints `GET/PUT/DELETE servers/:id/channels/:cid/overwrites[…]`.
- Effective-permission algorithm implemented ONCE in `packages/shared-domain`, Discord
  precedence: base(@everyone role) → role allows/denies aggregated → member overwrite; owner/
  ADMINISTRATOR bypass. Server enforces on message send/pin/manage + channel visibility
  (hidden channels omitted from `GET channels` per viewer, and gateway relays filtered).
- Golden table: `fixtures/permissions/golden.json` — 25 canonical cases (documented
  scenarios incl. deny-overrides-allow-at-same-level rules) each asserted against BOTH the
  shared lib (unit) and live server responses (integration). Client: overwrite editor screen
  per channel; composer/menus react to effective perms; SRV-010 announcement read-only
  falls out of this and gets its unit row.
- Risk note: gateway filtering touches P3-07 relays — chaos re-run of Phase-3 integration
  suite is a named gate for this item.

**P7-02 [BE+APP] Bans (FR-ROLE-004)** — `Ban {serverId, userId, reason?, createdBy}`;
`PUT/DELETE servers/:id/bans/:userId` (+optional `deleteMessageDays 0|1|7` purge), `GET
bans`; invite-accept + member-add reject banned; UI: ban from profile sheet w/ reason +
purge picker, bans list in server settings with revoke. Integration lifecycle: ban → purge
verified → rejoin blocked → unban → rejoin ok.

**P7-03 [BE+APP] Timeouts (FR-ROLE-005)** — `ServerMember.timedOutUntil DateTime?`;
`PUT servers/:id/members/:uid/timeout {until}` (cap 28d), DELETE to clear; server rejects
sends/reactions with 403 `code:"timed_out"`; gateway `member.updated` carries it; client
disables composer with countdown. Integration: send during timeout 403; expiry restores
(frozen-clock test).

**P7-04 [BE+APP] Audit log (FR-ROLE-006)** — write coverage: every mutation in P7-01..03 +
existing kick/role/channel/server mutations appends `AuditLog` (action enum, actor, target,
`changes` JSON diff); `GET servers/:id/audit-log?before&limit&action&actor` (MANAGE_SERVER);
client screen with filters. Integration: exactly-one-entry per action matrix.

**P7-05 [BE+APP] Message search (FR-MSG-020)** — Postgres FTS: generated `tsvector` column +
GIN index on Message (migration with `CONCURRENTLY` note for prod doc);
`GET servers/:id/search` and `GET channels/:id/search` `?q&author&before&limit` honoring
channel visibility from P7-01; snippet highlighting server-side (`ts_headline`). Client:
search screen, result rows jump via `?around` (P2-13). Integration: seeded corpus → exact
expected id sets incl. permission-filtered case. BAKE-OFF (05 §7) only if FTS p95 >300ms on
100k-msg seed: variants = (a) websearch_to_tsquery tuning, (b) pg_trgm — metric: p95 latency
+ recall on fixture queries.

**P7-06 [BE+APP] Per-server nicknames** — `ServerMember.nickname?`;
`PATCH servers/:id/members/:uid {nickname}` (self or MANAGE_MEMBERS); render precedence
nickname>displayName>username everywhere via one `domain/displayName.ts` helper (unit-tested,
lint rule bans direct `username` rendering in features/).

**P7-07 [BE+APP] @role mentions (FR-ROLE-007, P2)** — `Role.mentionable`; wire syntax
following the user-mention pattern; fan-out MENTION bus events to role members; composer
autocomplete + highlight; gate behind MENTION_EVERYONE? No — Discord parity: mentionable flag
only; permission check server-side.

**P7-08 [BE+APP] Custom emoji (P2)** — `ServerEmoji {serverId, name, assetId}` (uploads via
Phase-5 broker, MANAGE_SERVER); `:name:` parse/render in shared markdown rules; picker tab;
reactions accept custom ids (Reaction.emoji format extension — characterization update is
the intentional-change ritual per 02 §P0-04). Web renders as image via serializer field or
inert text — verify, Decision-Record the choice.

**P7-09 Audit & refactor + signoff.** Demo: mod workflow end-to-end — hide channel via
overwrite → timeout a heckler → ban with purge → review audit log → search old message →
jump. Gates: standard + golden-table 100% + Phase-3 suite chaos re-run + trace check
(ROLE/MSG-020/SRV-010 complete).
