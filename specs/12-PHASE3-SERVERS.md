# 12 — PHASE 3: Servers, Channels, Roles & Invites

Goal: full guild lifecycle from the phone: create, organize, invite, manage members and roles.
FRs: SRV-001..009, ROLE-001/002, APP-005. Out of scope: icons/uploads (Phase 5 — icon UI
shows initials avatar until then) · overwrites/bans/timeouts/audit-log (Phase 7) · sounds
management UI (P2 backlog; playback n/a mobile v1).

## Work items

**P3-01 Server rail v2** — `serverLayout` folders/order rendered + long-press drag reorder
writing the SAME JSON shape the web writes (Phase-0 capture the shape into the contract as a
JSON Schema; round-trip integration test byte-compares) (FR-SRV-001).

**P3-02 Create server & settings** — create flow (name → lands in default channel per
characterization), rename/delete with confirm, permission-gated via shared calculator
(FR-SRV-002/003). E2E `p3-01-create-server`.

**P3-03 Channel management** — create/edit/delete text & voice channels, category assignment,
category collapse (persisted in `ui` store), reorder screen driving
`PATCH channels/reorder` with the exact payload the web sends (contract-verified)
(FR-SRV-004/005). Integration: reorder persists + matches `GET channels` order.

**P3-04 Invites** — create/view code, native share sheet, join screen (code entry) using
`GET invites/:code` preview → accept; deep link `openchat://invite/<code>` +
`https://<CHAT_HOST>/invite/<code>` app link (FR-SRV-006, APP-005). E2E: second emulator
fresh user joins via `adb am start` URI. [BE, only if E-verified absent] alias route or
universal-link asset file — additive.

**P3-05 Members & profiles** — role-grouped member drawer with presence sort, profile sheet
(actions stub → Phase 4 wires DM/friend), kick with confirm (MANAGE_MEMBERS), leave server
(FR-SRV-007/008). Permission matrix unit + E2E kick.

**P3-06 Roles editor** — list ordered, create/rename/color (color set = web's palette,
captured Phase 0), permission toggles rendering `PERMISSION_LIST`, member assign/remove
(FR-ROLE-001). BigInt round-trip integration (string-serialized bits per shared-domain
helper). Shared calculator property suite lands here if not earlier (FR-ROLE-002).

**P3-07 [BE] Granular guild events (FR-SRV-009)** — additive bus events + gateway relays:
`server.updated`, `channel.created|updated|deleted`, `category.*`, `role.*`,
`member.joined|left|updated`, `channels.reordered {serverId}` — payloads = the REST
representation of the entity; relay scope: connected members of the server (extend gateway
subscription registry with server-scope; contract `x-added-by: P3`). Web client ignores
unknown ops (Phase-0-verify E2; if it crashes on unknown ops, feature-flag emission via env
until web patch — Decision Record). `sync/applyEvent` replaces the coarse invalidations for
these entities. Integration: create channel on A → visible on B ≤2s with network log proving
no `GET /servers` refetch.

**P3-08 Audit & refactor + signoff.** Demo: create server → organize 3 categories/6 channels
→ roles Admin/Mod → invite second device user → they join via deep link → kick/rejoin →
reorder reflected live on both devices.
Gates: standard + characterization/web-smoke green (P3-07 is the risk item — its rollback
plan is the env flag).
