# FR-SRV-009 Investigation

**Verdict: B — PARTIALLY BUILT**

The backend publishes all granular guild-structure events and dispatches them
to connected WS clients. The mobile client receives them and silently drops
them (`default: break`). Types exist but no handler.

## Requirement

| ID | Text | Criterion | Pri | Ph |
|----|------|-----------|-----|----|
| FR-SRV-009 | [BE] Granular realtime for guild structure: channel/category/role/member create-update-delete events (gateway additions, additive) | Integration: create channel on A → appears on B ≤2s WITHOUT refetch-all | P1 | 3 |

Source: `specs/01-REQUIREMENTS.md:89`

## Criterion analysis

The criterion is explicitly two-actor: User A creates a channel, User B sees it
in the UI via a granular WS event within 2 seconds, without a full `GET
/servers/:id` refetch. A server-only test that connects WS clients in-process
and inspects frame payloads does NOT satisfy this criterion — user B's mobile
UI never renders the new channel.

## Evidence — what exists

### API side (fully built)

All 10 events published via Redis Pub/Sub → `chat:events`:

| Event | Redis publish | Gateway dispatch |
|-------|--------------|-----------------|
| CHANNEL_CREATED | `servers.service.ts:312` | `events.gateway.ts:338-339` |
| CHANNEL_DELETED | `servers.service.ts:615` | `events.gateway.ts:341-342` |
| ROLE_CREATED | `servers.service.ts:426` | `events.gateway.ts:344-345` |
| ROLE_UPDATED | `servers.service.ts:455` | `events.gateway.ts:347-348` |
| ROLE_DELETED | `servers.service.ts:469` | `events.gateway.ts:350-351` |
| MEMBER_JOINED | `servers.service.ts:579`, `invites.service.ts:178` | `events.gateway.ts:353-356` |
| MEMBER_LEFT | `servers.service.ts:886` | `events.gateway.ts:358-361` |
| MEMBER_KICKED | `servers.service.ts:641`, `servers.service.ts:847` | `events.gateway.ts:363-365` |
| SERVER_UPDATED | `servers.service.ts:668` | `events.gateway.ts:367-368` |
| SERVER_DELETED | `servers.service.ts:686` | `events.gateway.ts:370-373` |

The gateway scopes delivery to server members (`client.serverIds.has(serverId)`)
and correctly updates membership tracking on join/leave/kick/delete.

#### Server test

`apps/api/test/integration/p3-09-granular-events.spec.ts` — 265 lines, `@satisfies FR-SRV-009`.

This test provisions Alice, Bob, and Carol via `dev-login`. It connects Bob and
Carol's WS clients in-memory and verifies that Bob (a member) receives granular
events while Carol (a non-member) does not. This proves the backend publishes
and dispatches correctly for WS-connected clients.

**This test is a server-only test.** It does not exercise the mobile app. It
proves the WS frame arrives at a raw WebSocket — it does NOT prove the channel
appears in Bob's mobile UI without a refetch.

### Mobile client (types only — no handler)

#### Types (generated, not hand-written)

`apps/mobile/src/realtime/events.d.ts:75-84` — all 10 frame interfaces generated
from `contracts/gateway-events.yaml`:

```typescript
export interface ChannelCreatedFrame { op: 'channel.created'; d: { channel: Record<string, unknown> } }
export interface ChannelDeletedFrame { op: 'channel.deleted'; d: { channelId: string } }
export interface RoleCreatedFrame { op: 'role.created'; d: { role: Record<string, unknown> } }
export interface RoleUpdatedFrame { op: 'role.updated'; d: { role: Record<string, unknown> } }
export interface RoleDeletedFrame { op: 'role.deleted'; d: { roleId: string } }
export interface MemberJoinedFrame { op: 'member.joined'; d: { member: Record<string, unknown> } }
export interface MemberLeftFrame { op: 'member.left'; d: { userId: string } }
export interface MemberKickedFrame { op: 'member.kicked'; d: { userId: string } }
export interface ServerUpdatedFrame { op: 'server.updated'; d: { server: Record<string, unknown> } }
export interface ServerDeletedFrame { op: 'server.deleted'; d: { serverId: string } }
```

The `S2CFrame` union (lines 86-100) includes all 10 types.

#### Handler — NOT built

`apps/mobile/src/sync/queryClient.ts:27-89` — the `applyEvent` switch handles:

- `message.created`, `message.updated`, `message.deleted`
- `typing`
- `ready`
- `presence`
- `notify`
- `mention`
- `call.ring`
- `voice.occupancy`

All other ops hit `default: break` (line 88). **None of the 10 guild-structure
events are handled.** The frame arrives, the type system accepts it (it's in
`S2CFrame`), and execution falls through to `break`.

#### Confirming comment

`queryClient.ts:4-6`:
```typescript
 * `notify` is the backend's coarse "something changed" signal (E3) until
 * FR-SRV-009 adds granular events, and on reconnect we refetch everything
 * active because there is no upstream event replay.
```

Today, when a channel is created, the mobile client relies on the coarse
`notify` event → `queryClient.invalidateQueries()` to refetch everything. The
criterion explicitly requires "WITHOUT refetch-all."

### Web client

`apps/web/src` — zero matches for any guild-structure event op string. The web
client also does not handle these events.

## What the FR-AUTH-001 precedent means here

FR-AUTH-001 was marked "satisfied" for months because `bearer-auth.spec.ts`
proved bearer tokens work via `dev-login`. The criterion required system-browser
OIDC PKCE — a client-side concern. The client half (`expo-auth-session`) did not
exist at all.

FR-SRV-009 is the same shape: `p3-09-granular-events.spec.ts` proves WS frame
emission to members, so it was tagged `@satisfies FR-SRV-009`. But the criterion
is two-actor E2E: User B's mobile UI must render the new channel from the
granular event within 2 seconds without refetching. The mobile app drops the
event. The server test does not satisfy the criterion.

## Concrete work needed

1. **Add cases in `apps/mobile/src/sync/queryClient.ts:applyEvent()`** for all
   10 guild-structure events. Each case must update the React Query cache
   directly (zero-delay), not trigger a refetch:

   - `channel.created` → prepend channel to `keys.channels(serverId)` cache
   - `channel.deleted` → remove channel from cache
   - `role.created` / `role.updated` / `role.deleted` → invalidate role queries
   - `member.joined` → prepend to member list
   - `member.left` / `member.kicked` → remove from member list
   - `server.updated` → update server in cache
   - `server.deleted` → remove server and invalidate

2. **Write a two-actor E2E test** (Maestro or Detox) that:
   - Provisions two users (Alice + Bob) in the same server
   - Alice creates a channel via the mobile UI
   - Bob's channel list updates within 2 seconds without navigation/refresh
   - Assert Bob sees the new channel name

3. **Write a mobile integration test** (mock WS → cache update) that verifies
   each event type mutates the React Query cache correctly.

4. **Correct the `@satisfies` annotation** on `p3-09-granular-events.spec.ts`:
   change from `@satisfies FR-SRV-009` to `@satisfies FR-SRV-009-server` or
   similar, since the file proves backend emission only.

5. **Web client** — same handler gap exists in `apps/web/src`. Track separately.

## Notes

- `CHANNEL_UPDATED` is published by `servers.service.ts:347` to Redis but has
  no case in the gateway dispatch (no `channel.updated` WS frame). The contract
  also does not define `channelUpdated`. This is a minor backend inconsistency
  outside FR-SRV-009's scope.
- The contract's event set matches what the gateway dispatches; the types in
  `events.d.ts` match the contract. No codegen gap.
- The test-world provisioning endpoint at `test-world.service.ts` seeds a
  second member since commit `2e94493`, enabling two-actor server tests but
  not E2E.
