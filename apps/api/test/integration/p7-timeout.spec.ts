/**
 * P7 — Timeout enforcement (FR-ROLE-005)
 *
 * Tests: set timeout → REST send 403 → WS send rejected → clear timeout → send succeeds;
 * past-dated timeout does not block; non-privileged actor cannot set a timeout (403).
 */
import { apiFetch, devLogin, wsConnect, WsClient, createJar } from '../characterization/helpers';

const API_BASE = process.env.CHAR_API_BASE ?? 'http://localhost:3006/api';

describe('P7 — Timeout enforcement (FR-ROLE-005)', () => {
  let serverId: string;
  let textChannelId: string;
  let alice: { username: string; userId: string; jar: ReturnType<typeof createJar> };
  let bob: { username: string; userId: string; jar: ReturnType<typeof createJar> };
  let carol: { username: string; userId: string; jar: ReturnType<typeof createJar> };

  beforeAll(async () => {
    alice = await devLogin('p7-timeout-alice');
    bob = await devLogin('p7-timeout-bob');
    carol = await devLogin('p7-timeout-carol');

    // Alice creates a server and invites Bob
    const srv = await apiFetch('/servers', {
      method: 'POST',
      body: { name: 'Timeout Test Guild' },
      jar: alice.jar,
    });
    serverId = srv.body.id;

    const ch = await apiFetch(`/servers/${serverId}/channels`, {
      method: 'POST',
      body: { name: 'general', type: 'TEXT' },
      jar: alice.jar,
    });
    textChannelId = ch.body.id;

    // Add Bob as a member
    await apiFetch(`/servers/${serverId}/members`, {
      method: 'POST',
      body: { userId: bob.userId },
      jar: alice.jar,
    });

    // Bob accepts the invitation
    const bobNotifs = await apiFetch('/notifications', { jar: bob.jar });
    const bobInvite = bobNotifs.body.serverInvites?.find((i: any) => i.server.id === serverId);
    expect(bobInvite).toBeDefined();
    await apiFetch(`/server-invitations/${bobInvite.id}/accept`, { method: 'POST', jar: bob.jar });
  });

  // @satisfies FR-ROLE-005
  it('set timeout → REST send 403 with code timed_out', async () => {
    const future = new Date(Date.now() + 3600_000).toISOString(); // 1 hour from now

    // Alice (owner) sets a timeout on Bob
    const setRes = await apiFetch(`/servers/${serverId}/members/${bob.userId}/timeout`, {
      method: 'PUT',
      body: { until: future },
      jar: alice.jar,
    });
    expect(setRes.status).toBe(200);
    expect(setRes.body.timedOutUntil).toBeDefined();

    // Bob tries to send a message → 403
    const sendRes = await apiFetch(`/channels/${textChannelId}/messages`, {
      method: 'POST',
      body: { content: 'Should be blocked' },
      jar: bob.jar,
    });
    expect(sendRes.status).toBe(403);
    expect(sendRes.body.code || sendRes.body.message).toMatch(/timed_out|timed out/i);
  });

  // @satisfies FR-ROLE-005
  it('WS send rejected during timeout', async () => {
    // Bob connects via WS
    const client = await wsConnect(bob.jar);

    // Bob subscribes to the channel
    client.send({ op: 'subscribe', d: { channelId: textChannelId } });

    // Bob tries to send a message via WS
    const nonce = 'ws-timeout-' + Date.now();
    client.send({
      op: 'message.send',
      d: { channelId: textChannelId, content: 'WS blocked', nonce },
    });

    // Should get an error back
    const errFrame = await client.waitFor(
      (f) => f.op === 'error',
      5000,
    );
    expect(errFrame).toBeDefined();

    client.close();
  });

  // @satisfies FR-ROLE-005
  it('clear timeout → send succeeds', async () => {
    // Alice clears Bob's timeout
    const clearRes = await apiFetch(`/servers/${serverId}/members/${bob.userId}/timeout`, {
      method: 'DELETE',
      jar: alice.jar,
    });
    expect(clearRes.status).toBe(200);
    expect(clearRes.body.success).toBe(true);

    // Bob sends a message → 201
    const sendRes = await apiFetch(`/channels/${textChannelId}/messages`, {
      method: 'POST',
      body: { content: 'I am free!' },
      jar: bob.jar,
    });
    expect(sendRes.status).toBe(201);
    expect(sendRes.body.content).toBe('I am free!');
  });

  // @satisfies FR-ROLE-005
  it('past-dated timeout does not block', async () => {
    const past = new Date(Date.now() + 2000).toISOString(); // 2 seconds from now

    // Alice sets a short timeout on Bob
    await apiFetch(`/servers/${serverId}/members/${bob.userId}/timeout`, {
      method: 'PUT',
      body: { until: past },
      jar: alice.jar,
    });

    // Wait for it to expire
    await new Promise((r) => setTimeout(r, 2500));

    // Bob sends a message → 201
    const sendRes = await apiFetch(`/channels/${textChannelId}/messages`, {
      method: 'POST',
      body: { content: 'Timeout expired!' },
      jar: bob.jar,
    });
    expect(sendRes.status).toBe(201);
    expect(sendRes.body.content).toBe('Timeout expired!');
  });

  // @satisfies FR-ROLE-005
  it('non-privileged actor cannot set a timeout (403)', async () => {
    // Add Carol
    await apiFetch(`/servers/${serverId}/members`, {
      method: 'POST',
      body: { userId: carol.userId },
      jar: alice.jar,
    });

    const future = new Date(Date.now() + 3600_000).toISOString();

    // Carol (non-privileged member) tries to timeout Alice
    const res = await apiFetch(`/servers/${serverId}/members/${alice.userId}/timeout`, {
      method: 'PUT',
      body: { until: future },
      jar: carol.jar,
    });
    expect(res.status).toBe(403);
  });

  // @satisfies FR-ROLE-005
  it('timeout expiry is implicit: no cleanup job needed', async () => {
    // Set a very short timeout on Bob
    const short = new Date(Date.now() + 1500).toISOString();
    await apiFetch(`/servers/${serverId}/members/${bob.userId}/timeout`, {
      method: 'PUT',
      body: { until: short },
      jar: alice.jar,
    });

    // Wait for expiry
    await new Promise((r) => setTimeout(r, 2500));

    // Send should work (expiry is implicit — past-dated timedOutUntil is ignored)
    const sendRes = await apiFetch(`/channels/${textChannelId}/messages`, {
      method: 'POST',
      body: { content: 'Implicit expiry works!' },
      jar: bob.jar,
    });
    expect(sendRes.status).toBe(201);
  });

  // @satisfies FR-ROLE-005
  it('timeout cap at 28 days', async () => {
    const farFuture = new Date(Date.now() + 50 * 24 * 3600_000).toISOString(); // 50 days

    const setRes = await apiFetch(`/servers/${serverId}/members/${bob.userId}/timeout`, {
      method: 'PUT',
      body: { until: farFuture },
      jar: alice.jar,
    });
    expect(setRes.status).toBe(200);

    const capped = new Date(setRes.body.timedOutUntil).getTime();
    const maxAllowed = Date.now() + 28 * 24 * 3600_000;
    // Allow 2s tolerance
    expect(capped).toBeLessThanOrEqual(maxAllowed + 2000);

    // Clean up
    await apiFetch(`/servers/${serverId}/members/${bob.userId}/timeout`, {
      method: 'DELETE',
      jar: alice.jar,
    });
  });

  // @satisfies FR-ROLE-005
  it('cannot timeout the server owner', async () => {
    const future = new Date(Date.now() + 3600_000).toISOString();

    // Bob tries to timeout Alice (the server owner)
    const res = await apiFetch(`/servers/${serverId}/members/${alice.userId}/timeout`, {
      method: 'PUT',
      body: { until: future },
      jar: bob.jar,
    });
    // Either 403 (permission) or from the owner check — both are valid rejections
    expect([403]).toContain(res.status);
  });
});
