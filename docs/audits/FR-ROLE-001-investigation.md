# FR-ROLE-001 Investigation

**Date:** 2026-07-26
**Verdict:** B — PARTIALLY BUILT

The mobile client lacks the member role assignment/removal half of the feature. The
server, web client, and mobile role-editor (name/color/permissions) are all built.
The web PERMISSION_LIST is also stale (missing 3 permission entries).

## Requirement

**FR-ROLE-001** (specs/01-REQUIREMENTS.md:95):
> Role list + editor: name, color, permission toggles (bitfield), assign/remove per member

**Acceptance criterion:** Integration: BigInt bitfield round-trip exact; UI matches `PERMISSION_LIST` labels

**Priority:** P0 | **Phase:** 3

## What exists — server

All CRUD + assign endpoints are live:

- `GET /servers/:id/roles` — list (`servers.controller.ts:233`)
- `POST /servers/:id/roles` — create (`servers.controller.ts:238`)
- `PATCH /servers/:id/roles/:roleId` — update (`servers.controller.ts:248`)
- `DELETE /servers/:id/roles/:roleId` — delete (`servers.controller.ts:259`)
- `PUT /servers/:id/members/:userId/roles/:roleId` — assign (`servers.controller.ts:268`)
- `DELETE /servers/:id/members/:userId/roles/:roleId` — unassign (`servers.controller.ts:299`)

Prisma `Role` model at `apps/api/prisma/schema.prisma:157`. Permissions are transported as
decimal strings (BigInt-safe). The `PERMISSION_LIST` in
`apps/api/src/permissions/permissions.ts:34-46` has 11 entries (ADMINISTRATOR through
READ_MESSAGES). Contract documented in `contracts/openapi.yaml` (§/servers/{id}/roles and
§/servers/{id}/members/{userId}/roles/{roleId}).

### Server test

`apps/api/test/integration/s5-roles.spec.ts:1-169` — covers:
- BigInt round-trip with high bits >2^53 (line 47)
- Bit toggle precision (line 84)
- Member role assignment + unassignment + re-query confirmation (line 128)

## What exists — web client

`apps/web/src/components/ServerSettingsModal.tsx` has:
- Roles tab: list, create, edit (name, color, permission checkboxes using `PERMISSION_LIST`),
  delete (lines 350-410)
- Members tab: per-member role assignment/removal via `toggleMemberRole` (lines 429-446),
  backed by `api.assignRole` and `api.unassignRole` (`apps/web/src/lib/api.ts:67-70`)

### Web defect: stale PERMISSION_LIST

`apps/web/src/lib/permissions.ts:14-23` defines only 8 PERMISSION_LIST entries (missing
BAN_MEMBERS, SEND_MESSAGES, READ_MESSAGES). The `Permission` object also defines only 8
bits (lines 3-11). Consequence: the web role editor silently ignores 3 permission bits.
A role created on mobile with BAN_MEMBERS set survives a web edit (BigInt bits pass
through), but a role created on web cannot have those 3 bits set, and existing bits are
invisible on web.

Server PERMISSION_LIST (`apps/api/src/permissions/permissions.ts:34`): 11 entries
Web PERMISSION_LIST (`apps/web/src/lib/permissions.ts:14`): 8 entries (missing 3)
Mobile PERMISSION_LIST (`apps/mobile/src/features/shell/screens/RolesEditorScreen.tsx:35`): 11 entries ✓

## What exists — mobile client

`apps/mobile/src/features/shell/screens/RolesEditorScreen.tsx:1-348` — full role CRUD:
- Role list with color dots + permissions display (lines 211-227)
- Create/edit modal: name TextInput, color swatches, 11 permission Switch toggles (lines 230-295)
- Delete confirmation modal (lines 297-316)
- BigInt-safe helpers: `strToBigInt`, `bigIntToStr`, `hasBit`, `toggleBit` (lines 72-89)
- React Query mutations: `useCreateRole`, `useUpdateRole`, `useDeleteRole` (lines 93-119)
- Wired into `ShellScreen.tsx` via `roles-editor-button` testID (line 794) and conditional
  render gated on `MANAGE_ROLES` permission (lines 1053-1056)

### Mobile tests

- `apps/mobile/src/api/__tests__/permissions.test.ts:1-179` — BigInt round-trip, bit toggle
  precision, Number() corruption proof, all 11 bits unique
- `apps/mobile/src/features/shell/__tests__/rolesEditorModalStructure.test.tsx` — modal
  structure regression guard
- `apps/mobile/src/features/shell/__tests__/invalidation.test.ts` — mutation cache
  invalidation

## What is missing — mobile member assignment

**Zero references** to `assignRole`, `unassignRole`, `setMemberRole`, or `toggleMemberRole`
anywhere in `apps/mobile/src/` (232 files searched).

The `MemberList` component (`apps/mobile/src/features/shell/MemberList.tsx:1-167`) is a
display-only SectionList grouped by role. It receives `roles` as a prop but has no
per-member role toggle UI. The `MemberProfileSheet` (`apps/mobile/src/features/shell/MemberProfileSheet.tsx:1-150`) has kick/leave actions but no role management.

The web client implements this in the members tab of `ServerSettingsModal.tsx` — the mobile
equivalent does not exist.

## No upstream merge

The implementation commit `a2b3ddb` (2026-07-25, "[S5] FR-ROLE-001 …") is in-tree, not from
an upstream merge. The commit added the mobile RolesEditorScreen and server integration test
but the mobile member-assignment half was deferred.

## No existing BACKLOG entry

`docs/BACKLOG.md` has UNBUILT-001 through UNBUILT-005. None cover FR-ROLE-001.

## FR-AUTH-001 parallel

Like FR-AUTH-001, one half exists and is tested (server endpoints + integration test) while
a client half is unbuilt (mobile member assignment). Unlike FR-AUTH-001, the web client is
complete and the mobile role-editor UI IS built — the gap is narrower: just the
per-member role toggle UI on mobile.

## Work required

1. **Mobile member role assignment** — Add per-member role toggles to `MemberList` or
   `MemberProfileSheet`, backed by `api.assignRole` / `api.unassignRole` calls. The server
   endpoints and React Query patterns already exist; this is a UI task.
2. **Web PERMISSION_LIST fix** — Add BAN_MEMBERS (1n<<8n), SEND_MESSAGES (1n<<9n),
   READ_MESSAGES (1n<<10n) to `apps/web/src/lib/permissions.ts` `Permission` object and
   `PERMISSION_LIST`.
3. **Integration test** — Extend `s5-roles.spec.ts` or add a client-level E2E test that
   exercises the full flow: create role with permissions → assign to member → verify
   member list → unassign → verify removal.
