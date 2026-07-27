# E2E Two-Participant Provisioning Gap

## Summary

The `POST /api/dev/test-world` endpoint does **not** add the friend user as a
member of the provisioned server. The CLI tool `tools/test-world.mjs` **does**,
via invite/accept. The migrated `p3-05-members-kick-leave.yaml` flow uses env
vars and would work with the CLI path, but cannot work if a flow calls the
endpoint directly and expects the friend in the member list.

## What exists today

### API endpoint: `test-world.service.ts`

`apps/api/src/test-world/test-world.service.ts:52-56` — the `provision()` method
creates exactly **one** `serverMember`:

```ts
// ── Server member (owner) ──
await this.prisma.serverMember.create({
  data: { serverId: server.id, userId: primaryUser.id },
});
```

The `friendUser` is created at line 42 (`this.authService.devLogin(friendUsername)`)
and a friendship + DM channel are established (lines 68-97), but the friend is
**never** joined to the server. No second `serverMember.create` call exists
anywhere in the method.

The response shape at lines 116-137 includes `fixtures.friend.userId` and
`fixtures.friend.username` but no `friendToken`. The response is:

```ts
{
  username, userId, tokens,           // primary user + their tokens
  fixtures: {
    serverId, serverName,
    channels: { general, random, voice },
    friend: { userId, username },     // friend exists but is NOT a server member
    dmChannelId, messageIds
  }
}
```

### CLI tool: `tools/test-world.mjs`

`tools/test-world.mjs:180-192` — after creating the server, the script creates
an invite and has the friend accept it:

```js
// ── 7. Add friend to server (via invite) ──
const inviteRes = await apiFetch(apiBase, `/servers/${serverId}/invites`, {
  method: 'POST', body: {}, jar: testJar
});
const inviteCode = inviteRes.body?.code;
const acceptRes = await apiFetch(apiBase, `/invites/${inviteCode}/accept`, {
  method: 'POST', jar: friendJar
});
```

The CLI tool also exports `E2E_FRIEND_TOKEN` (line 295), which the endpoint does
not return.

### E2E runner: `tools/e2e-provision.sh`

`tools/e2e-provision.sh:21` calls `node "$REPO_ROOT/tools/test-world.mjs"` —
the CLI tool, **not** the API endpoint. So all existing E2E flows that use the
runner get the friend as a server member. The gap only matters if a flow calls
the endpoint directly.

### Current p3-05 flow

`apps/mobile/e2e/flows/p3-05-members-kick-leave.yaml` was migrated in commit
`ab2c6ad` ("e2e: migrate all 30 flows to provisioned test worlds"). It uses:

```yaml
- runFlow: _login.yaml
# ...
- assertVisible:
    id: 'member-${E2E_USERNAME}'
- assertVisible:
    id: 'member-${E2E_FRIEND_USERNAME}'
```

No hardcoded "alice". Relies on the friend being in the member list.

## What is missing

The API endpoint at `apps/api/src/test-world/test-world.service.ts` needs one
additional `serverMember.create` call for `friendUser`. This is a one-line
addition inside the existing `provision()` method, not a contract change.

### Recommended change (endpoint only — no contract delta)

After line 56 (the existing `serverMember.create` for primaryUser), add:

```ts
// ── Server member (friend — needed for kick/member-list E2E flows) ──
await this.prisma.serverMember.create({
  data: { serverId: server.id, userId: friendUser.id },
});
```

This requires:
- **No request shape change.** The endpoint accepts only `{ label?: string }`.
- **No response shape change.** `fixtures.friend` already carries `userId` and
  `username` — the member list just works.
- **No new auth or permission implication.** The server owner is `primaryUser`;
  `friendUser` is a plain member with no special role. This exactly mirrors the
  scenario p3-05 verifies (owner sees kick button for other member, leave button
  for self).

### Optional: friend token in response

If a future flow needs to **act as the friend** (e.g., log in as the friend to
verify the kicked-user experience), the response would need a `friendTokens`
field. The CLI tool already exports `E2E_FRIEND_TOKEN`. The endpoint currently
does not. This is out of scope for p3-05 (which only needs the friend visible in
the member list) but worth noting.

## Contract implication

**None.** The endpoint's request and response shapes remain unchanged. The
behavior change (friend now appears in server member list) is additive and
backward-compatible — no existing flow breaks, no new fields are required.

## Auth / permission note

No permission concern. The test-world endpoint is gated by `DEV_AUTH=1` and
`NODE_ENV != 'production'` (`test-world.controller.ts:19`). The friend is
provisioned as a regular server member — no role assignment, no elevated
permissions. The server owner (primaryUser) retains full control.

## What p3-05 flow needs (no changes required)

The current migrated flow at `apps/mobile/e2e/flows/p3-05-members-kick-leave.yaml`
is already correct for the CLI provisioning path. Once the endpoint gap is
closed (one-line addition above), the flow works with either provisioning path.

No flow diff is required.
