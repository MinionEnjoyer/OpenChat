/**
 * P3-09 — granular guild-structure realtime events (FR-SRV-009).
 *
 * For each mutation over REST, assert the correct granular WS op arrives
 * on a fellow member's connection, AND assert a NON-member does NOT receive it.
 *
 * @satisfies FR-SRV-009
 */
import { apiFetch, wsConnect, WsClient } from '../characterization/helpers';

// This test must run with CHAR_API_BASE + CHAR_WS_BASE pointing to port 3017.
// Example: CHAR_API_BASE=http://localhost:3017/api CHAR_WS_BASE=ws://localhost:3017/ws npx jest ...

async function devLogin(username: string) {
  const jar = (await import('../characterization/helpers')).createJar();
  const res = await apiFetch('/auth/dev-login', { method: 'POST', body: { username }, jar });
  if (res.status !== 201 && res.status !== 200) throw new Error(`dev-login failed: ${res.status}`);
  return { username, userId: res.body.id, jar };
}

interface TestContext {
  alice: { username: string; userId: string; jar: any };
  bob: { username: string; userId: string; jar: any };
  carol: { username: string; userId: string; jar: any };
  serverId: string;
  bobWs: WsClient;
  carolWs: WsClient;
}

async function setup(): Promise<TestContext> {
  const alice = await devLogin('p3-09-alice');
  const bob   = await devLogin('p3-09-bob');
  const carol = await devLogin('p3-09-carol');

  // Create server
  const srv = await apiFetch('/servers', { method: 'POST', body: { name: 'P3-09 Guild' }, jar: alice.jar });
  expect(srv.status).toBe(201);
  const serverId = srv.body.id;

  // Add bob as member (creates PENDING invitation)
  const invRes = await apiFetch(`/servers/${serverId}/members`, { method: 'POST', body: { userId: bob.userId }, jar: alice.jar });
  // Accept invitation as bob via notifications
  const bobNotifs = await apiFetch('/notifications', { jar: bob.jar });
  expect(bobNotifs.status).toBe(200);
  const invItem = bobNotifs.body.serverInvites?.find((i: any) => i.server.id === serverId);
  if (invItem) {
    await apiFetch(`/server-invitations/${invItem.id}/accept`, { method: 'POST', jar: bob.jar });
  }

  // Connect WS clients
  const bobWs   = await wsConnect(bob.jar);
  const carolWs = await wsConnect(carol.jar);

  // Wait for both 'ready' frames
  expect(bobWs.frames.find((f) => f.op === 'ready')).toBeDefined();
  expect(carolWs.frames.find((f) => f.op === 'ready')).toBeDefined();

  return { alice, bob, carol, serverId, bobWs, carolWs };
}

describe('P3-09 — granular guild-structure realtime events (FR-SRV-009)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setup();
  }, 30_000);

  afterAll(() => {
    ctx?.bobWs?.close();
    ctx?.carolWs?.close();
  });

  // Helper: wait for event on member WS, assert NOT on non-member WS
  async function assertMemberEvent(op: string, action: () => Promise<any>) {
    const bobBefore = ctx.bobWs.frames.length;
    const carolBefore = ctx.carolWs.frames.length;

    await action();

    // Wait for bob to receive the event
    const bobEvent = await ctx.bobWs.waitFor((f) => f.op === op, 10_000);
    expect(bobEvent).toBeDefined();
    expect(bobEvent.op).toBe(op);

    // Assert carol did NOT receive it
    const carolNew = ctx.carolWs.frames.slice(carolBefore);
    const carolGot = carolNew.find((f) => f.op === op);
    expect(carolGot).toBeUndefined();
  }

  // ── Channel ──

  // @satisfies FR-SRV-009
  it('emits channel.created to members on POST /servers/:id/channels', async () => {
    let channelId: string;
    await assertMemberEvent('channel.created', async () => {
      const res = await apiFetch(`/servers/${ctx.serverId}/channels`, {
        method: 'POST', body: { name: 'events-test', type: 'TEXT' }, jar: ctx.alice.jar,
      });
      expect(res.status).toBe(201);
      channelId = res.body.id;
    });
    // Cleanup
    await apiFetch(`/servers/${ctx.serverId}/channels/${channelId}`, { method: 'DELETE', jar: ctx.alice.jar });
  });

  // @satisfies FR-SRV-009
  it('emits channel.deleted to members on DELETE /servers/:id/channels/:cid', async () => {
    // Create a channel first
    const ch = await apiFetch(`/servers/${ctx.serverId}/channels`, {
      method: 'POST', body: { name: 'to-delete', type: 'TEXT' }, jar: ctx.alice.jar,
    });
    const channelId = ch.body.id;

    await assertMemberEvent('channel.deleted', async () => {
      await apiFetch(`/servers/${ctx.serverId}/channels/${channelId}`, { method: 'DELETE', jar: ctx.alice.jar });
    });
  });

  // ── Role ──

  // @satisfies FR-SRV-009
  it('emits role.created to members on POST /servers/:id/roles', async () => {
    let roleId: string;
    await assertMemberEvent('role.created', async () => {
      const res = await apiFetch(`/servers/${ctx.serverId}/roles`, {
        method: 'POST', body: { name: 'EventRole', color: 0xff00ff, permissions: '0' }, jar: ctx.alice.jar,
      });
      expect(res.status).toBe(201);
      roleId = res.body.id;
    });
    // Cleanup
    await apiFetch(`/servers/${ctx.serverId}/roles/${roleId}`, { method: 'DELETE', jar: ctx.alice.jar });
  });

  // @satisfies FR-SRV-009
  it('emits role.updated to members on PATCH /servers/:id/roles/:rid', async () => {
    // Create a role first
    const role = await apiFetch(`/servers/${ctx.serverId}/roles`, {
      method: 'POST', body: { name: 'ToUpdate', color: 0x0000ff, permissions: '0' }, jar: ctx.alice.jar,
    });
    expect(role.status).toBe(201);
    const roleId = role.body.id;

    await assertMemberEvent('role.updated', async () => {
      await apiFetch(`/servers/${ctx.serverId}/roles/${roleId}`, {
        method: 'PATCH', body: { name: 'UpdatedRole' }, jar: ctx.alice.jar,
      });
    });

    // Cleanup
    await apiFetch(`/servers/${ctx.serverId}/roles/${roleId}`, { method: 'DELETE', jar: ctx.alice.jar });
  });

  // @satisfies FR-SRV-009
  it('emits role.deleted to members on DELETE /servers/:id/roles/:rid', async () => {
    // Create a role first
    const role = await apiFetch(`/servers/${ctx.serverId}/roles`, {
      method: 'POST', body: { name: 'ToDelete', color: 0x00ff00, permissions: '0' }, jar: ctx.alice.jar,
    });
    expect(role.status).toBe(201);
    const roleId = role.body.id;

    await assertMemberEvent('role.deleted', async () => {
      await apiFetch(`/servers/${ctx.serverId}/roles/${roleId}`, { method: 'DELETE', jar: ctx.alice.jar });
    });
  });

  // ── Server ──

  // @satisfies FR-SRV-009
  it('emits server.updated to members on PATCH /servers/:id', async () => {
    await assertMemberEvent('server.updated', async () => {
      await apiFetch(`/servers/${ctx.serverId}`, {
        method: 'PATCH', body: { name: 'P3-09 Guild Updated' }, jar: ctx.alice.jar,
      });
    });
  });

  // @satisfies FR-SRV-009
  it('emits server.deleted to members on DELETE /servers/:id', async () => {
    // Create a separate server for deletion so other tests still work
    const srv = await apiFetch('/servers', { method: 'POST', body: { name: 'ToDeleteSrv' }, jar: ctx.alice.jar });
    expect(srv.status).toBe(201);
    const delServerId = srv.body.id;

    // Bob needs to be a member to get the event — add him
    await apiFetch(`/servers/${delServerId}/members`, { method: 'POST', body: { userId: ctx.bob.userId }, jar: ctx.alice.jar });
    const bobNotifs = await apiFetch('/notifications', { jar: ctx.bob.jar });
    const invItem = bobNotifs.body.serverInvites?.find((i: any) => i.server.id === delServerId);
    if (invItem) {
      await apiFetch(`/server-invitations/${invItem.id}/accept`, { method: 'POST', jar: ctx.bob.jar });
      // Wait for bob's WS to register the new membership before deleting
      await ctx.bobWs.waitFor((f: any) => f.op === 'member.joined', 10_000);
    }

    await assertMemberEvent('server.deleted', async () => {
      await apiFetch(`/servers/${delServerId}`, { method: 'DELETE', jar: ctx.alice.jar });
    });
  });

  // ── Member ──

  // @satisfies FR-SRV-009
  it('emits member.joined to members when a user accepts an invite', async () => {
    // Create a fresh user to join
    const newcomer = await devLogin('p3-09-newcomer');
    const newcomerWs = await wsConnect(newcomer.jar);

    // Alice invites the newcomer
    await apiFetch(`/servers/${ctx.serverId}/members`, { method: 'POST', body: { userId: newcomer.userId }, jar: ctx.alice.jar });

    // Newcomer accepts
    const newcomerNotifs = await apiFetch('/notifications', { jar: newcomer.jar });
    expect(newcomerNotifs.status).toBe(200);
    const invItem = newcomerNotifs.body.serverInvites?.find((i: any) => i.server.id === ctx.serverId);
    expect(invItem).toBeDefined();

    await assertMemberEvent('member.joined', async () => {
      await apiFetch(`/server-invitations/${invItem.id}/accept`, { method: 'POST', jar: newcomer.jar });
    });

    newcomerWs.close();

    // Cleanup: kick newcomer
    await apiFetch(`/servers/${ctx.serverId}/members/${newcomer.userId}`, { method: 'DELETE', jar: ctx.alice.jar });
  });

  // @satisfies FR-SRV-009
  it('emits member.kicked to members when a member is kicked', async () => {
    // Add a disposable member
    const victim = await devLogin('p3-09-victim');
    const victimWs = await wsConnect(victim.jar);
    await apiFetch(`/servers/${ctx.serverId}/members`, { method: 'POST', body: { userId: victim.userId }, jar: ctx.alice.jar });
    const victimNotifs = await apiFetch('/notifications', { jar: victim.jar });
    const invItem = victimNotifs.body.serverInvites?.find((i: any) => i.server.id === ctx.serverId);
    if (invItem) {
      await apiFetch(`/server-invitations/${invItem.id}/accept`, { method: 'POST', jar: victim.jar });
    }

    await assertMemberEvent('member.kicked', async () => {
      await apiFetch(`/servers/${ctx.serverId}/members/${victim.userId}`, { method: 'DELETE', jar: ctx.alice.jar });
    });

    victimWs.close();
  });

  // @satisfies FR-SRV-009
  it('emits member.left to members when a member leaves', async () => {
    // Add a disposable member who will leave
    const leaver = await devLogin('p3-09-leaver');
    const leaverWs = await wsConnect(leaver.jar);
    await apiFetch(`/servers/${ctx.serverId}/members`, { method: 'POST', body: { userId: leaver.userId }, jar: ctx.alice.jar });
    const leaverNotifs = await apiFetch('/notifications', { jar: leaver.jar });
    const invItem = leaverNotifs.body.serverInvites?.find((i: any) => i.server.id === ctx.serverId);
    if (invItem) {
      await apiFetch(`/server-invitations/${invItem.id}/accept`, { method: 'POST', jar: leaver.jar });
    }

    await assertMemberEvent('member.left', async () => {
      await apiFetch(`/servers/${ctx.serverId}/members/me`, { method: 'DELETE', jar: leaver.jar });
    });

    leaverWs.close();
  });
});
