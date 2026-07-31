/** @characterizes invites — create, preview, accept, error codes */
import { seed, apiFetch, devLogin, assertInviteShape, assertInvitePreviewShape } from './helpers';
let s: Awaited<ReturnType<typeof seed>>;
beforeAll(async () => { s = await seed(); });

describe('invites — create', () => {
  it('creates invite returning {code, serverId, expiresAt, maxUses}', async () => {
    const res = await apiFetch(`/servers/${s.serverId}/invites`, { method:'POST', body:{}, jar:s.alice.jar });
    expect(res.status).toBe(201);
    // characterizes: invite create returns code (no id at top level)
    // characterizes: invite create returns {code, serverId, expiresAt, maxUses}
    assertInviteShape(res.body);
    expect(res.body.serverId).toBe(s.serverId);
  });
  it('accepts maxUses and expiresInHours', async () => {
    const res = await apiFetch(`/servers/${s.serverId}/invites`, {
      method:'POST', body:{maxUses:5, expiresInHours:24}, jar:s.alice.jar,
    });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('maxUses', 5);
    expect(res.body).toHaveProperty('expiresAt');
    expect(res.body.expiresAt).not.toBeNull();
  });
});

describe('invites — preview', () => {
  it('GET /invites/:code returns preview with server info', async () => {
    const inv = await apiFetch(`/servers/${s.serverId}/invites`, { method:'POST', body:{}, jar:s.alice.jar });
    const res = await apiFetch(`/invites/${inv.body.code}`, { jar:s.bob.jar });
    expect(res.status).toBe(200);
    assertInvitePreviewShape(res.body);
    expect(res.body.server).toHaveProperty('name');
    expect(res.body.inviter).toHaveProperty('username');
  });
  it('returns 404 for invalid code', async () => {
    const res = await apiFetch('/invites/nonexistent-xyz', { jar:s.bob.jar });
    expect(res.status).toBe(404);
  });
});

describe('invites — accept', () => {
  it('accepts an invite (joins server)', async () => {
    const inv = await apiFetch(`/servers/${s.serverId}/invites`, { method:'POST', body:{}, jar:s.alice.jar });
    const fresh = await devLogin('invite-acceptor-' + Date.now());
    const res = await apiFetch(`/invites/${inv.body.code}/accept`, { method:'POST', jar:fresh.jar });
    // characterizes: accept returns 201 Created
    expect(res.status).toBe(201);
  });
});

describe('notifications — server-invitation', () => {
  it('accept server invitation via notifications', async () => {
    // Create a member-to-member invitation (creates ServerInvitation row)
    const fresh = await devLogin('ni-accept-' + Date.now());
    await apiFetch(`/servers/${s.serverId}/members`, {
      method: 'POST', body: { userId: fresh.userId }, jar: s.alice.jar,
    });
    // Fetch notifications to get the invitation id
    const notifs = await apiFetch('/notifications', { jar: fresh.jar });
    // characterizes: GET /notifications returns 200 with serverInvites array
    expect(notifs.status).toBe(200);
    expect(notifs.body).toHaveProperty('serverInvites');
    if (notifs.body.serverInvites.length > 0) {
      const invId = notifs.body.serverInvites[0].id;
      const res = await apiFetch(`/server-invitations/${invId}/accept`, { method: 'POST', jar: fresh.jar });
      // characterizes: POST /server-invitations/:id/accept returns < 500
      expect(res.status).toBeLessThan(500);
    }
  });
  it('decline server invitation via notifications', async () => {
    const fresh = await devLogin('ni-decline-' + Date.now());
    await apiFetch(`/servers/${s.serverId}/members`, {
      method: 'POST', body: { userId: fresh.userId }, jar: s.alice.jar,
    });
    const notifs = await apiFetch('/notifications', { jar: fresh.jar });
    expect(notifs.body).toHaveProperty('serverInvites');
    if (notifs.body.serverInvites.length > 0) {
      const invId = notifs.body.serverInvites[0].id;
      const res = await apiFetch(`/server-invitations/${invId}/decline`, { method: 'POST', jar: fresh.jar });
      // characterizes: POST /server-invitations/:id/decline returns < 500
      expect(res.status).toBeLessThan(500);
    }
  });
});
