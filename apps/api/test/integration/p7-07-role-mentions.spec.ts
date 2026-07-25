/**
 * P7 — @role mentions with mentionable flag and notification fan-out (FR-ROLE-007)
 *
 * @satisfies FR-ROLE-007
 *
 * Proves:
 *  1. Sending @RoleName triggers MENTION events for all members with that role.
 *  2. A non-mentionable role does NOT trigger MENTION events.
 *  3. Toggling mentionable on a role is reflected in the serialized role response.
 */
import { apiFetch, devLogin, wsConnect, type createJar } from '../characterization/helpers';

describe('P7 — @role mentions (FR-ROLE-007)', () => {
  let serverId: string;
  let textChannelId: string;
  let alice: { username: string; userId: string; jar: ReturnType<typeof createJar> };
  let bob: { username: string; userId: string; jar: ReturnType<typeof createJar> };
  let carol: { username: string; userId: string; jar: ReturnType<typeof createJar> };
  let modRoleId: string;
  let everyoneRoleId: string;

  beforeAll(async () => {
    alice = await devLogin('p7-rment-alice');
    bob = await devLogin('p7-rment-bob');
    carol = await devLogin('p7-rment-carol');

    // Alice creates server
    const srv = await apiFetch('/servers', {
      method: 'POST',
      body: { name: 'Role Mention Guild' },
      jar: alice.jar,
    });
    serverId = srv.body.id;

    const ch = await apiFetch(`/servers/${serverId}/channels`, {
      method: 'POST',
      body: { name: 'general', type: 'TEXT' },
      jar: alice.jar,
    });
    textChannelId = ch.body.id;

    // Add Bob and Carol
    await apiFetch(`/servers/${serverId}/members`, {
      method: 'POST', body: { userId: bob.userId }, jar: alice.jar,
    });
    await apiFetch(`/servers/${serverId}/members`, {
      method: 'POST', body: { userId: carol.userId }, jar: alice.jar,
    });

    // Bob and Carol accept invitations
    for (const user of [bob, carol]) {
      const notifs = await apiFetch('/notifications', { jar: user.jar });
      const invite = notifs.body.serverInvites?.find((i: any) => i.server.id === serverId);
      if (invite) {
        await apiFetch(`/server-invitations/${invite.id}/accept`, { method: 'POST', jar: user.jar });
      }
    }

    // Get @everyone role id
    const roles = await apiFetch(`/servers/${serverId}/roles`, { jar: alice.jar });
    everyoneRoleId = roles.body.find((r: any) => r.name === '@everyone')?.id;

    // Create a mentionable "Mod" role
    const modRole = await apiFetch(`/servers/${serverId}/roles`, {
      method: 'POST',
      body: { name: 'Mod', color: 0x5865f2, permissions: '512', mentionable: true },
      jar: alice.jar,
    });
    modRoleId = modRole.body.id;

    // Assign "Mod" role to Bob
    await apiFetch(`/servers/${serverId}/members/${bob.userId}/roles/${modRoleId}`, {
      method: 'PUT',
      jar: alice.jar,
    });

    // Carol does NOT have the Mod role
  });

  // @satisfies FR-ROLE-007
  it('@Mod mention triggers MENTION event for Bob (role member) via WS', async () => {
    // Bob connects and subscribes to the channel
    const bobWs = await wsConnect(bob.jar);
    bobWs.send({ op: 'subscribe', d: { channelId: textChannelId } });

    // Small delay for subscription
    await new Promise((r) => setTimeout(r, 300));

    // Alice sends a message mentioning @Mod
    const sendRes = await apiFetch(`/channels/${textChannelId}/messages`, {
      method: 'POST',
      body: { content: 'Hey @Mod, check this out!' },
      jar: alice.jar,
    });
    expect(sendRes.status).toBe(201);

    // Bob should receive a MENTION event
    const mentionFrame = await bobWs.waitFor(
      (f: any) => f.op === 'mention',
      5000,
    );
    expect(mentionFrame).toBeDefined();
    expect(mentionFrame.d.channelId).toBe(textChannelId);
    expect(mentionFrame.d.authorName).toBeTruthy();

    bobWs.close();
  });

  // @satisfies FR-ROLE-007
  it('@Mod mention does NOT trigger MENTION event for Carol (non-role-member)', async () => {
    // Carol connects and subscribes
    const carolWs = await wsConnect(carol.jar);
    carolWs.send({ op: 'subscribe', d: { channelId: textChannelId } });

    await new Promise((r) => setTimeout(r, 300));

    // Alice sends another role mention
    await apiFetch(`/channels/${textChannelId}/messages`, {
      method: 'POST',
      body: { content: 'Paging @Mod again' },
      jar: alice.jar,
    });

    // Wait a bit and check collected frames — Carol should NOT have a MENTION event
    await new Promise((r) => setTimeout(r, 1000));
    const mentions = carolWs.filterFrames((f: any) => f.op === 'mention');
    expect(mentions.length).toBe(0);

    carolWs.close();
  });

  // @satisfies FR-ROLE-007
  it('non-mentionable role does NOT trigger MENTION events', async () => {
    // Make Mod non-mentionable
    const patchRes = await apiFetch(`/servers/${serverId}/roles/${modRoleId}`, {
      method: 'PATCH',
      body: { mentionable: false },
      jar: alice.jar,
    });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.mentionable).toBe(false);

    // Bob connects
    const bobWs = await wsConnect(bob.jar);
    bobWs.send({ op: 'subscribe', d: { channelId: textChannelId } });

    await new Promise((r) => setTimeout(r, 300));

    // Alice sends @Mod mention
    await apiFetch(`/channels/${textChannelId}/messages`, {
      method: 'POST',
      body: { content: '@Mod should be silent now' },
      jar: alice.jar,
    });

    // Bob should NOT receive a MENTION event
    await new Promise((r) => setTimeout(r, 1000));
    const mentions = bobWs.filterFrames((f: any) => f.op === 'mention');
    expect(mentions.length).toBe(0);

    bobWs.close();

    // Restore mentionable for subsequent tests
    await apiFetch(`/servers/${serverId}/roles/${modRoleId}`, {
      method: 'PATCH',
      body: { mentionable: true },
      jar: alice.jar,
    });
  });

  // @satisfies FR-ROLE-007
  it('mentionable flag is present in role serialization and defaults to true', async () => {
    // List roles — verify mentionable is present
    const list = await apiFetch(`/servers/${serverId}/roles`, { jar: alice.jar });
    expect(list.status).toBe(200);

    const mod = list.body.find((r: any) => r.name === 'Mod');
    expect(mod).toBeDefined();
    expect(mod.mentionable).toBe(true);

    const everyone = list.body.find((r: any) => r.name === '@everyone');
    expect(everyone).toBeDefined();
    expect(everyone.mentionable).toBe(true);
  });

  // @satisfies FR-ROLE-007
  it('role with spaces in name can be mentioned', async () => {
    // Create a role with spaces
    const role = await apiFetch(`/servers/${serverId}/roles`, {
      method: 'POST',
      body: { name: 'Cool People', color: 0x00ff00, mentionable: true },
      jar: alice.jar,
    });
    expect(role.status).toBe(201);
    const coolRoleId = role.body.id;

    // Assign to Carol
    await apiFetch(`/servers/${serverId}/members/${carol.userId}/roles/${coolRoleId}`, {
      method: 'PUT',
      jar: alice.jar,
    });

    // Carol connects
    const carolWs = await wsConnect(carol.jar);
    carolWs.send({ op: 'subscribe', d: { channelId: textChannelId } });

    await new Promise((r) => setTimeout(r, 300));

    // Alice mentions the role with spaces
    await apiFetch(`/channels/${textChannelId}/messages`, {
      method: 'POST',
      body: { content: 'Hey @Cool People, party time!' },
      jar: alice.jar,
    });

    // Carol should get a MENTION event
    const mentionFrame = await carolWs.waitFor(
      (f: any) => f.op === 'mention',
      5000,
    );
    expect(mentionFrame).toBeDefined();
    expect(mentionFrame.d.channelId).toBe(textChannelId);

    carolWs.close();

    // Cleanup
    await apiFetch(`/servers/${serverId}/members/${carol.userId}/roles/${coolRoleId}`, {
      method: 'DELETE',
      jar: alice.jar,
    });
    await apiFetch(`/servers/${serverId}/roles/${coolRoleId}`, {
      method: 'DELETE',
      jar: alice.jar,
    });
  });
});
