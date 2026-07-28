/**
 * P7-02 — Ban/unban integration tests (FR-ROLE-004).
 *
 * @satisfies FR-ROLE-004
 *
 * Full lifecycle: ban → member gone → invite-accept rejected → unban → invite-accept succeeds.
 * Plus: non-privileged actor gets 403; message purge actually removes messages when requested
 * and leaves them when not.
 */
import { apiFetch, createJar } from '../characterization/helpers';

const API = { put: 'PUT', post: 'POST', delete: 'DELETE', get: 'GET' } as const;

async function devLoginBearer(username: string) {
  const jar = createJar();
  const res = await apiFetch('/auth/dev-login', {
    method: API.post,
    body: { username },
    jar,
  });
  expect(res.status).toBe(201);
  return { userId: res.body.id as string, accessToken: res.body.accessToken as string, jar };
}

function bearer(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` };
}

describe('P7-02 — Ban/unban with invite enforcement (FR-ROLE-004)', () => {
  let owner: { userId: string; accessToken: string };
  let target: { userId: string; accessToken: string };
  let bystander: { userId: string; accessToken: string };
  let serverId: string;
  let generalChannelId: string;

  beforeAll(async () => {
    // Create fresh users
    const ts = Date.now();
    owner = await devLoginBearer(`p7-ban-owner-${ts}`);
    target = await devLoginBearer(`p7-ban-target-${ts}`);
    bystander = await devLoginBearer(`p7-ban-bystander-${ts}`);

    // Owner creates a server
    const srv = await apiFetch('/servers', {
      method: API.post,
      headers: bearer(owner.accessToken),
      body: { name: `BanTest-${ts}` },
    });
    expect(srv.status).toBe(201);
    serverId = srv.body.id;

    // Get the general channel
    const chans = await apiFetch(`/servers/${serverId}/channels`, {
      headers: bearer(owner.accessToken),
    });
    generalChannelId = chans.body[0].id;

    // Create an invite for target to join
    const inv = await apiFetch(`/servers/${serverId}/invites`, {
      method: API.post,
      headers: bearer(owner.accessToken),
      body: {},
    });
    expect(inv.status).toBe(201);

    // Target accepts invite — joins the server
    const join = await apiFetch(`/invites/${inv.body.code}/accept`, {
      method: API.post,
      headers: bearer(target.accessToken),
    });
    expect(join.status).toBe(201);
  });

  // @satisfies FR-ROLE-004 (non-privileged actor gets 403)
  it('non-privileged actor (no BAN_MEMBERS) gets 403 when trying to ban', async () => {
    const res = await apiFetch(`/servers/${serverId}/bans/${target.userId}`, {
      method: API.put,
      headers: bearer(bystander.accessToken),
      body: { reason: 'i should not be able to do this' },
    });
    expect(res.status).toBe(403);
  });

  // @satisfies FR-ROLE-004 (ban → member gone)
  it('ban removes the member from the server', async () => {
    const res = await apiFetch(`/servers/${serverId}/bans/${target.userId}`, {
      method: API.put,
      headers: bearer(owner.accessToken),
      body: { reason: 'violation' },
    });
    expect(res.status).toBe(200);
    expect(res.body.user.username).toContain('p7-ban-target');
    expect(res.body.reason).toBe('violation');

    // Verify member is gone
    const members = await apiFetch(`/servers/${serverId}/members`, {
      headers: bearer(owner.accessToken),
    });
    const targetStillMember = members.body.find((m: any) => m.userId === target.userId);
    expect(targetStillMember).toBeUndefined();
  });

  // @satisfies FR-ROLE-004 (invite-accept rejected for banned user)
  it('banned user cannot rejoin via invite', async () => {
    // Create a new invite
    const inv = await apiFetch(`/servers/${serverId}/invites`, {
      method: API.post,
      headers: bearer(owner.accessToken),
      body: {},
    });
    expect(inv.status).toBe(201);

    // Target tries to accept
    const res = await apiFetch(`/invites/${inv.body.code}/accept`, {
      method: API.post,
      headers: bearer(target.accessToken),
    });
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('You are banned from this server');
  });

  // @satisfies FR-ROLE-004 (unban → invite-accept succeeds)
  it('unban allows the user to rejoin via invite', async () => {
    // Unban
    const unban = await apiFetch(`/servers/${serverId}/bans/${target.userId}`, {
      method: API.delete,
      headers: bearer(owner.accessToken),
    });
    expect(unban.status).toBe(200);
    expect(unban.body.success).toBe(true);

    // Bans list is empty for this user
    const bans = await apiFetch(`/servers/${serverId}/bans`, {
      headers: bearer(owner.accessToken),
    });
    const stillBanned = bans.body.find((b: any) => b.userId === target.userId);
    expect(stillBanned).toBeUndefined();

    // Create fresh invite
    const inv = await apiFetch(`/servers/${serverId}/invites`, {
      method: API.post,
      headers: bearer(owner.accessToken),
      body: {},
    });
    expect(inv.status).toBe(201);

    // Accept should now succeed
    const accept = await apiFetch(`/invites/${inv.body.code}/accept`, {
      method: API.post,
      headers: bearer(target.accessToken),
    });
    expect(accept.status).toBe(201);
    expect(accept.body.name).toBeTruthy();
  });

  // @satisfies FR-ROLE-004 (list bans)
  it('list bans shows all banned users', async () => {
    // Ban bystander too so list has entries
    await apiFetch(`/servers/${serverId}/bans/${bystander.userId}`, {
      method: API.put,
      headers: bearer(owner.accessToken),
      body: { reason: 'testing list' },
    });

    const bans = await apiFetch(`/servers/${serverId}/bans`, {
      headers: bearer(owner.accessToken),
    });
    expect(bans.status).toBe(200);
    expect(Array.isArray(bans.body)).toBe(true);
    expect(bans.body.length).toBeGreaterThanOrEqual(1);
    // Verify shape
    const b = bans.body[0];
    expect(b).toHaveProperty('id');
    expect(b).toHaveProperty('userId');
    expect(b).toHaveProperty('serverId');
    expect(b).toHaveProperty('reason');
    expect(b).toHaveProperty('createdById');
    expect(b).toHaveProperty('createdAt');
    expect(b.user).toHaveProperty('username');
    expect(b.createdBy).toHaveProperty('username');

    // Clean up: unban bystander
    await apiFetch(`/servers/${serverId}/bans/${bystander.userId}`, {
      method: API.delete,
      headers: bearer(owner.accessToken),
    });
  });

  // @satisfies FR-ROLE-004 (message purge)
  it('ban with deleteMessageDays purges messages; ban without leaves them', async () => {
    // Target sends some messages
    for (let i = 0; i < 3; i++) {
      await apiFetch(`/channels/${generalChannelId}/messages`, {
        method: API.post,
        headers: bearer(target.accessToken),
        body: { content: `pre-ban message ${i}` },
      });
    }

    // Ban with deleteMessageDays=1 (purge last 1 day's messages)
    const ban = await apiFetch(`/servers/${serverId}/bans/${target.userId}`, {
      method: API.put,
      headers: bearer(owner.accessToken),
      body: { reason: 'message purge test', deleteMessageDays: 1 },
    });
    expect(ban.status).toBe(200);

    // Target's messages should be soft-deleted (deletedAt set)
    const msgs = await apiFetch(`/channels/${generalChannelId}/messages`, {
      headers: bearer(owner.accessToken),
    });
    const targetMsgs = msgs.body.filter((m: any) => m.authorId === target.userId);
    // All target's messages should have deletedAt set
    for (const m of targetMsgs) {
      expect(m.deletedAt).not.toBeNull();
    }

    // Unban + rejoin
    await apiFetch(`/servers/${serverId}/bans/${target.userId}`, {
      method: API.delete,
      headers: bearer(owner.accessToken),
    });
    const inv = await apiFetch(`/servers/${serverId}/invites`, {
      method: API.post,
      headers: bearer(owner.accessToken),
      body: {},
    });
    await apiFetch(`/invites/${inv.body.code}/accept`, {
      method: API.post,
      headers: bearer(target.accessToken),
    });

    // Target sends more messages
    for (let i = 0; i < 2; i++) {
      await apiFetch(`/channels/${generalChannelId}/messages`, {
        method: API.post,
        headers: bearer(target.accessToken),
        body: { content: `post-ban message ${i}` },
      });
    }

    // Ban WITHOUT deleteMessageDays
    const ban2 = await apiFetch(`/servers/${serverId}/bans/${target.userId}`, {
      method: API.put,
      headers: bearer(owner.accessToken),
      body: { reason: 'no purge test' },
    });
    expect(ban2.status).toBe(200);

    // Check that post-ban messages are NOT deleted
    const msgs2 = await apiFetch(`/channels/${generalChannelId}/messages`, {
      headers: bearer(owner.accessToken),
    });
    const postBanMsgs = msgs2.body.filter(
      (m: any) => m.authorId === target.userId && m.content.includes('post-ban'),
    );
    for (const m of postBanMsgs) {
      expect(m.deletedAt).toBeNull();
    }
  });
});
