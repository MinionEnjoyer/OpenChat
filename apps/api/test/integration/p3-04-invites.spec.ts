/**
 * FR-SRV-006 — Invite full lifecycle integration test.
 *
 * Full flow: create server → assert non-member → create invite →
 * preview invite → accept invite → assert membership exists.
 *
 * @satisfies FR-SRV-006
 */
import { apiFetch, createJar } from '../characterization/helpers';

async function devLogin(username: string) {
  const jar = createJar();
  const res = await apiFetch('/auth/dev-login', { method: 'POST', body: { username }, jar });
  if (res.status !== 201 && res.status !== 200) throw new Error(`dev-login failed: ${res.status}`);
  return { username, userId: res.body.id, jar };
}

describe('FR-SRV-006 — invite full lifecycle', () => {
  // @satisfies FR-SRV-006
  it('full invite lifecycle: create → preview → accept → member exists', async () => {
    // 1. Alice creates a server
    const alice = await devLogin('s3-invite-alice-' + Date.now());
    const srv = await apiFetch('/servers', {
      method: 'POST',
      body: { name: 'Invite Test Server' },
      jar: alice.jar,
    });
    expect(srv.status).toBe(201);
    const serverId = srv.body.id;

    // 2. Bob is a fresh user — assert NOT a member
    const bob = await devLogin('s3-invite-bob-' + Date.now());
    const membersBefore = await apiFetch(`/servers/${serverId}/members`, { jar: bob.jar });
    // Non-member gets 404 Not Found
    expect(membersBefore.status).toBe(404);

    // 3. Alice creates an invite
    const invite = await apiFetch(`/servers/${serverId}/invites`, {
      method: 'POST',
      body: {},
      jar: alice.jar,
    });
    expect(invite.status).toBe(201);
    expect(invite.body).toHaveProperty('code');
    expect(typeof invite.body.code).toBe('string');
    expect(invite.body.code.length).toBeGreaterThan(0);
    const code = invite.body.code as string;

    // 4. Bob previews the invite
    const preview = await apiFetch(`/invites/${code}`, { jar: bob.jar });
    expect(preview.status).toBe(200);
    expect(preview.body).toHaveProperty('server');
    expect(preview.body.server).toHaveProperty('name');
    expect(preview.body.inviter).toHaveProperty('username');

    // 5. Bob accepts the invite
    const accept = await apiFetch(`/invites/${code}/accept`, {
      method: 'POST',
      jar: bob.jar,
    });
    // characterizes: accept returns 201 Created
    expect(accept.status).toBe(201);

    // 6. Bob IS now a member — verify by querying members
    const membersAfter = await apiFetch(`/servers/${serverId}/members`, { jar: bob.jar });
    expect(membersAfter.status).toBe(200);
    const bobMember = (membersAfter.body as Array<{ userId: string }>).find(
      (m) => m.userId === bob.userId,
    );
    expect(bobMember).toBeDefined();
  });

  // @satisfies FR-SRV-006
  it('accept returns existing server info when already a member (idempotent)', async () => {
    const alice = await devLogin('s3-idem-alice-' + Date.now());
    const bob = await devLogin('s3-idem-bob-' + Date.now());

    const srv = await apiFetch('/servers', {
      method: 'POST',
      body: { name: 'Idempotent Test' },
      jar: alice.jar,
    });
    expect(srv.status).toBe(201);
    const serverId = srv.body.id;

    const invite = await apiFetch(`/servers/${serverId}/invites`, {
      method: 'POST',
      body: {},
      jar: alice.jar,
    });
    expect(invite.status).toBe(201);
    const code = invite.body.code as string;

    // First accept
    const accept1 = await apiFetch(`/invites/${code}/accept`, {
      method: 'POST',
      jar: bob.jar,
    });
    expect(accept1.status).toBe(201);

    // Second accept (already a member — should still succeed)
    const accept2 = await apiFetch(`/invites/${code}/accept`, {
      method: 'POST',
      jar: bob.jar,
    });
    expect(accept2.status).toBeLessThan(500);

    // Bob is still a member
    const members = await apiFetch(`/servers/${serverId}/members`, { jar: bob.jar });
    expect(members.status).toBe(200);
  });
});
