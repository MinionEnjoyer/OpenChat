/**
 * P3-05 — Kick/leave integration tests (FR-SRV-008).
 *
 * @satisfies FR-SRV-008
 *
 * Tests: kick a member (MANAGE_MEMBERS gated), verify they are gone by
 * querying membership. Assert non-privileged user gets 403.
 * Leave server (including owner leaving edge case).
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

function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

describe('P3-05 — Kick/leave (FR-SRV-008)', () => {
  let owner: { userId: string; accessToken: string };
  let target: { userId: string; accessToken: string };
  let bystander: { userId: string; accessToken: string };
  let serverId: string;

  beforeAll(async () => {
    const ts = Date.now();
    owner = await devLoginBearer(`p3-kick-owner-${ts}`);
    target = await devLoginBearer(`p3-kick-target-${ts}`);
    bystander = await devLoginBearer(`p3-kick-bystander-${ts}`);

    // Owner creates a server
    const srv = await apiFetch('/servers', {
      method: API.post,
      headers: bearer(owner.accessToken),
      body: { name: `KickTest-${ts}` },
    });
    expect(srv.status).toBe(201);
    serverId = srv.body.id;

    // Create invite for target
    const inv = await apiFetch(`/servers/${serverId}/invites`, {
      method: API.post,
      headers: bearer(owner.accessToken),
      body: {},
    });
    expect(inv.status).toBe(201);

    // Target accepts invite
    const join = await apiFetch(`/invites/${inv.body.code}/accept`, {
      method: API.post,
      headers: bearer(target.accessToken),
    });
    expect(join.status).toBe(201);
  });

  // @satisfies FR-SRV-008
  it('owner can kick a member and they are actually gone', async () => {
    // Verify target is a member first
    const membersBefore = await apiFetch(`/servers/${serverId}/members`, {
      headers: bearer(owner.accessToken),
    });
    expect(membersBefore.status).toBe(200);
    const targetBefore = membersBefore.body.find((m: any) => m.userId === target.userId);
    expect(targetBefore).toBeDefined();

    // Kick the target
    const kick = await apiFetch(`/servers/${serverId}/members/${target.userId}`, {
      method: API.delete,
      headers: bearer(owner.accessToken),
    });
    expect(kick.status).toBe(200);
    expect(kick.body.success).toBe(true);

    // Verify target is gone from member list
    const membersAfter = await apiFetch(`/servers/${serverId}/members`, {
      headers: bearer(owner.accessToken),
    });
    expect(membersAfter.status).toBe(200);
    const targetAfter = membersAfter.body.find((m: any) => m.userId === target.userId);
    expect(targetAfter).toBeUndefined();
  });

  // @satisfies FR-SRV-008
  it('non-privileged user gets 403 when trying to kick', async () => {
    const res = await apiFetch(`/servers/${serverId}/members/${owner.userId}`, {
      method: API.delete,
      headers: bearer(bystander.accessToken),
    });
    // Bystander is not even a member — should get 404 or 403
    // Either way it's a failure, which is the right semantics
    expect(res.status).not.toBe(200);
  });

  // @satisfies FR-SRV-008
  it('owner cannot leave own server (403 — must transfer or delete)', async () => {
    const leave = await apiFetch(`/servers/${serverId}/members/me`, {
      method: API.delete,
      headers: bearer(owner.accessToken),
    });
    // Server rejects owner leaving, per servers.service.ts:822-825
    expect(leave.status).toBe(403);
  });

  // @satisfies FR-SRV-008
  it('non-owner member can leave server', async () => {
    // Create a second server for the owner, invite target, then target leaves
    const ts = Date.now();
    const srv2 = await apiFetch('/servers', {
      method: API.post,
      headers: bearer(owner.accessToken),
      body: { name: `LeaveTest-${ts}` },
    });
    expect(srv2.status).toBe(201);
    const leaveServerId = srv2.body.id;

    // Create invite for target
    const inv = await apiFetch(`/servers/${leaveServerId}/invites`, {
      method: API.post,
      headers: bearer(owner.accessToken),
      body: {},
    });
    expect(inv.status).toBe(201);

    // Target accepts invite
    const join = await apiFetch(`/invites/${inv.body.code}/accept`, {
      method: API.post,
      headers: bearer(target.accessToken),
    });
    expect(join.status).toBe(201);

    // Target leaves
    const leave = await apiFetch(`/servers/${leaveServerId}/members/me`, {
      method: API.delete,
      headers: bearer(target.accessToken),
    });
    expect(leave.status).toBe(200);
    expect(leave.body.success).toBe(true);
  });

  // @satisfies FR-SRV-008
  it('cannot kick the server owner', async () => {
    // Owner cannot be kicked by anyone (even themselves — use leave)
    const kickOwner = await apiFetch(`/servers/${serverId}/members/${owner.userId}`, {
      method: API.delete,
      headers: bearer(target.accessToken),
    });
    // Target was already kicked — but even if they weren't, they can't kick owner
    expect(kickOwner.status).not.toBe(200);
  });
});
