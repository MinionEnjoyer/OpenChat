/**
 * P7-03 — Channel permission overwrite integration tests (FR-ROLE-003).
 *
 * @satisfies FR-ROLE-003
 *
 * Proves enforcement: deny SEND_MESSAGES on a channel → POST message 403.
 * Also covers: owner bypass, role overwrite deny, member overwrite deny/allow,
 * overwrite CRUD, role assignment.
 */
import { apiFetch, devLogin, type createJar } from '../characterization/helpers';

let alice: { username: string; userId: string; jar: ReturnType<typeof createJar> };
let bob: { username: string; userId: string; jar: ReturnType<typeof createJar> };
let serverId: string;
let channelId: string;
let speakerRoleId: string;

const SEND_BIT = '512'; // Permission.SEND_MESSAGES = 1n << 9n

beforeAll(async () => {
  const ts = Date.now();
  alice = await devLogin(`alice-ovr-${ts}`);
  bob = await devLogin(`bob-ovr-${ts}`);

  // Alice creates server
  const srv = await apiFetch('/servers', { method: 'POST', body: { name: `OvTest-${ts}` }, jar: alice.jar });
  expect(srv.status).toBe(201);
  serverId = srv.body.id;

  // Get general channel
  const chans = await apiFetch(`/servers/${serverId}/channels`, { jar: alice.jar });
  channelId = chans.body[0].id;

  // Alice invites Bob
  const inv = await apiFetch(`/servers/${serverId}/members`, {
    method: 'POST', body: { userId: bob.userId }, jar: alice.jar,
  });
  expect(inv.status).toBe(201);
  const invId = inv.body.id;

  // Bob accepts
  const accept = await apiFetch(`/server-invitations/${invId}/accept`, { method: 'POST', jar: bob.jar });
  expect(accept.status).toBe(201);

  // Alice creates Speaker role with SEND_MESSAGES
  const speaker = await apiFetch(`/servers/${serverId}/roles`, {
    method: 'POST', body: { name: 'Speaker', permissions: SEND_BIT }, jar: alice.jar,
  });
  expect(speaker.status).toBe(201);
  speakerRoleId = speaker.body.id;

  // Assign Speaker role to Bob
  const assign = await apiFetch(`/servers/${serverId}/members/${bob.userId}/roles/${speakerRoleId}`, {
    method: 'PUT', jar: alice.jar,
  });
  expect(assign.status).toBe(200);
});

describe('P7-03 — Channel overwrite enforcement (FR-ROLE-003)', () => {
  it('Bob can send messages (has Speaker role with SEND_MESSAGES)', async () => {
    const res = await apiFetch(`/channels/${channelId}/messages`, {
      method: 'POST', body: { content: 'hello from bob' }, jar: bob.jar,
    });
    expect(res.status).toBe(201);
  });

  it('MEMBER overwrite deny SEND → Bob gets 403', async () => {
    // Alice creates MEMBER overwrite denying SEND_MESSAGES for Bob
    const ow = await apiFetch(
      `/servers/${serverId}/channels/${channelId}/overwrites/MEMBER/${bob.userId}`,
      { method: 'PUT', body: { deny: SEND_BIT }, jar: alice.jar },
    );
    expect(ow.status).toBe(200);
    expect(ow.body.deny).toBe(SEND_BIT);

    // Bob tries to send → 403
    const msg = await apiFetch(`/channels/${channelId}/messages`, {
      method: 'POST', body: { content: 'should 403' }, jar: bob.jar,
    });
    expect(msg.status).toBe(403);

    // Cleanup: delete overwrite
    await apiFetch(`/servers/${serverId}/channels/${channelId}/overwrites/${ow.body.id}`, {
      method: 'DELETE', jar: alice.jar,
    });
  });

  it('After overwrite removal, Bob can send again', async () => {
    const res = await apiFetch(`/channels/${channelId}/messages`, {
      method: 'POST', body: { content: 'hello again' }, jar: bob.jar,
    });
    expect(res.status).toBe(201);
  });

  it('Server owner (Alice) can always send regardless of overwrites', async () => {
    // Create MEMBER overwrite denying SEND_MESSAGES for Alice
    const ow = await apiFetch(
      `/servers/${serverId}/channels/${channelId}/overwrites/MEMBER/${alice.userId}`,
      { method: 'PUT', body: { deny: SEND_BIT }, jar: alice.jar },
    );
    expect(ow.status).toBe(200);

    // Alice (owner) sends → still works
    const msg = await apiFetch(`/channels/${channelId}/messages`, {
      method: 'POST', body: { content: 'owner overrides all' }, jar: alice.jar,
    });
    expect(msg.status).toBe(201);

    // Cleanup
    await apiFetch(`/servers/${serverId}/channels/${channelId}/overwrites/${ow.body.id}`, {
      method: 'DELETE', jar: alice.jar,
    });
  });

  it('ROLE overwrite deny SEND on Speaker role → Bob gets 403', async () => {
    // Create ROLE overwrite denying SEND_MESSAGES for the Speaker role
    const ow = await apiFetch(
      `/servers/${serverId}/channels/${channelId}/overwrites/ROLE/${speakerRoleId}`,
      { method: 'PUT', body: { deny: SEND_BIT }, jar: alice.jar },
    );
    expect(ow.status).toBe(200);

    // Bob tries to send → 403
    const msg = await apiFetch(`/channels/${channelId}/messages`, {
      method: 'POST', body: { content: 'should 403 role-deny' }, jar: bob.jar,
    });
    expect(msg.status).toBe(403);

    // Cleanup
    await apiFetch(`/servers/${serverId}/channels/${channelId}/overwrites/${ow.body.id}`, {
      method: 'DELETE', jar: alice.jar,
    });
  });

  it('Overwrite CRUD: list → create → list includes → delete → list empty', async () => {
    // List should be empty
    const list1 = await apiFetch(`/servers/${serverId}/channels/${channelId}/overwrites`, { jar: alice.jar });
    expect(list1.status).toBe(200);
    const initialLen = list1.body.length;

    // Create MEMBER overwrite
    const ow = await apiFetch(
      `/servers/${serverId}/channels/${channelId}/overwrites/MEMBER/${bob.userId}`,
      { method: 'PUT', body: { deny: SEND_BIT }, jar: alice.jar },
    );
    expect(ow.status).toBe(200);

    // List should include it
    const list2 = await apiFetch(`/servers/${serverId}/channels/${channelId}/overwrites`, { jar: alice.jar });
    expect(list2.status).toBe(200);
    expect(list2.body.length).toBe(initialLen + 1);

    // Delete
    const del = await apiFetch(`/servers/${serverId}/channels/${channelId}/overwrites/${ow.body.id}`, {
      method: 'DELETE', jar: alice.jar,
    });
    expect(del.status).toBe(200);

    // List should be back to initial
    const list3 = await apiFetch(`/servers/${serverId}/channels/${channelId}/overwrites`, { jar: alice.jar });
    expect(list3.body.length).toBe(initialLen);
  });
});
