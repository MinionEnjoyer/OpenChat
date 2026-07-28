/**
 * FR-SRV-010 — Announcement channel permissions endpoint integration test.
 *
 * @satisfies FR-SRV-010
 *
 * Proves: GET /servers/:id/channels/:channelId/permissions/me returns
 * effective channel permissions (post-overwrites) for the current user,
 * and the SEND_MESSAGES bit correctly reflects overwrite state.
 */
import { apiFetch, devLogin, type createJar } from '../characterization/helpers';

let alice: { username: string; userId: string; jar: ReturnType<typeof createJar> };
let bob: { username: string; userId: string; jar: ReturnType<typeof createJar> };
let serverId: string;
let announceChannelId: string;

const SEND_BIT = '512'; // Permission.SEND_MESSAGES = 1n << 9n

beforeAll(async () => {
  const ts = Date.now();
  alice = await devLogin(`alice-ann-${ts}`);
  bob = await devLogin(`bob-ann-${ts}`);

  // Alice creates server
  const srv = await apiFetch('/servers', { method: 'POST', body: { name: `AnnTest-${ts}` }, jar: alice.jar });
  expect(srv.status).toBe(201);
  serverId = srv.body.id;

  // Alice creates an ANNOUNCEMENT channel
  const chan = await apiFetch(`/servers/${serverId}/channels`, {
    method: 'POST', body: { name: 'announcements', type: 'ANNOUNCEMENT' }, jar: alice.jar,
  });
  expect(chan.status).toBe(201);
  announceChannelId = chan.body.id;

  // Alice invites Bob
  const inv = await apiFetch(`/servers/${serverId}/members`, {
    method: 'POST', body: { userId: bob.userId }, jar: alice.jar,
  });
  expect(inv.status).toBe(201);
  const invId = inv.body.id;

  // Bob accepts
  const accept = await apiFetch(`/server-invitations/${invId}/accept`, { method: 'POST', jar: bob.jar });
  expect(accept.status).toBe(201);
});

describe('FR-SRV-010 — channel permissions endpoint', () => {
  // @satisfies FR-SRV-010
  it('returns 200 with permissions string for owner (has all permissions)', async () => {
    const res = await apiFetch(
      `/servers/${serverId}/channels/${announceChannelId}/permissions/me`,
      { jar: alice.jar },
    );
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('permissions');
    // Owner always has all permissions — SEND_MESSAGES bit should be set
    const perms = BigInt(res.body.permissions);
    expect(perms & BigInt(SEND_BIT)).toBe(BigInt(SEND_BIT));
  });

  // @satisfies FR-SRV-010
  it('returns permissions for regular member (no overwrites yet)', async () => {
    const res = await apiFetch(
      `/servers/${serverId}/channels/${announceChannelId}/permissions/me`,
      { jar: bob.jar },
    );
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('permissions');
    // Bob is a regular member with @everyone role — SEND_MESSAGES is in default @everyone permissions
    const perms = BigInt(res.body.permissions);
    expect(perms & BigInt(SEND_BIT)).toBe(BigInt(SEND_BIT));
  });

  // @satisfies FR-SRV-010
  it('reflects MEMBER overwrite allow for SEND_MESSAGES', async () => {
    // Alice grants Bob SEND_MESSAGES via member overwrite
    const ow = await apiFetch(
      `/servers/${serverId}/channels/${announceChannelId}/overwrites/MEMBER/${bob.userId}`,
      { method: 'PUT', body: { allow: SEND_BIT }, jar: alice.jar },
    );
    expect(ow.status).toBe(200);

    // Bob's permissions should now include SEND_MESSAGES
    const res = await apiFetch(
      `/servers/${serverId}/channels/${announceChannelId}/permissions/me`,
      { jar: bob.jar },
    );
    expect(res.status).toBe(200);
    const perms = BigInt(res.body.permissions);
    expect(perms & BigInt(SEND_BIT)).toBe(BigInt(SEND_BIT));
  });

  // @satisfies FR-SRV-010
  it('reflects MEMBER overwrite deny for SEND_MESSAGES', async () => {
    // Alice denies Bob SEND_MESSAGES (replaces previous allow)
    const ow = await apiFetch(
      `/servers/${serverId}/channels/${announceChannelId}/overwrites/MEMBER/${bob.userId}`,
      { method: 'PUT', body: { allow: '0', deny: SEND_BIT }, jar: alice.jar },
    );
    expect(ow.status).toBe(200);

    // Bob's permissions should now exclude SEND_MESSAGES
    const res = await apiFetch(
      `/servers/${serverId}/channels/${announceChannelId}/permissions/me`,
      { jar: bob.jar },
    );
    expect(res.status).toBe(200);
    const perms = BigInt(res.body.permissions);
    expect(perms & BigInt(SEND_BIT)).toBe(0n);
  });

  // @satisfies FR-SRV-010
  it('returns 401 for unauthenticated request', async () => {
    const res = await apiFetch(
      `/servers/${serverId}/channels/${announceChannelId}/permissions/me`,
    );
    expect(res.status).toBe(401);
  });

  // @satisfies FR-SRV-010
  it('returns 403 for non-member', async () => {
    const stranger = await devLogin(`stranger-ann-${Date.now()}`);
    const res = await apiFetch(
      `/servers/${serverId}/channels/${announceChannelId}/permissions/me`,
      { jar: stranger.jar },
    );
    expect(res.status).toBe(403);
  });
});
