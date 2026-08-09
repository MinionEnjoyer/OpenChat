import { BotsController, ServerBotsController } from './bots/bots.controller';
import { FriendsController } from './friends/friends.controller';
import { MessagesController } from './messages/messages.controller';
import { ServersController } from './servers/servers.controller';
import { WatchPartyController } from './watchparty/watchparty.controller';

function serviceMock() {
  const target: Record<string, jest.Mock> = {};
  return new Proxy(target, {
    get(obj, prop: string) {
      if (!obj[prop]) obj[prop] = jest.fn().mockResolvedValue({ ok: true });
      return obj[prop];
    },
  });
}

describe('HTTP controller request mapping', () => {
  const user = { id: 'user-1' } as any;

  it('maps every server administration route to its scoped service operation', async () => {
    const servers = serviceMock();
    servers.getChannelPermissions.mockResolvedValue(513n);
    const controller = new ServersController(servers as any);
    const body = { name: 'Name', iconUrl: '/icon', emoji: '🔊', url: '/api/media/a/raw' } as any;

    expect(controller.permissionCatalog()).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'ADMINISTRATOR' })]));
    await Promise.all([
      controller.list(user), controller.create(user, body), controller.get('server-1', user),
      controller.update('server-1', user, body), controller.deleteServer('server-1', user),
      controller.listSounds('server-1', user), controller.addSound('server-1', user, body),
      controller.updateSound('server-1', 'sound-1', user, body), controller.deleteSound('server-1', 'sound-1', user),
      controller.listStickers('server-1', user), controller.addSticker('server-1', user, body),
      controller.deleteSticker('server-1', 'sticker-1', user), controller.listCategories('server-1', user),
      controller.listChannels('server-1', user), controller.createChannel('server-1', user, { name: 'chat', type: 'TEXT' }),
      controller.reorderChannels('server-1', user, { orderedIds: ['channel-1'] }),
      controller.updateChannel('server-1', 'channel-1', user, body),
      controller.deleteChannel('server-1', 'channel-1', user), controller.listMembers('server-1', user),
      controller.inviteMember('server-1', user, { userId: 'invitee-1' }), controller.leave('server-1', user),
      controller.kick('server-1', 'member-1', user), controller.listBans('server-1', user),
      controller.banMember('server-1', 'member-1', user, { reason: 'spam', deleteMessageDays: 1 }),
      controller.unbanMember('server-1', 'member-1', user), controller.listRoles('server-1', user),
      controller.createRole('server-1', user, body), controller.updateRole('server-1', 'role-1', user, body),
      controller.deleteRole('server-1', 'role-1', user),
      controller.assignRole('server-1', 'member-1', 'role-1', user),
      controller.unassignRole('server-1', 'member-1', 'role-1', user),
      controller.setTimeout('server-1', 'member-1', user, { until: '2026-09-01T00:00:00.000Z' }),
      controller.clearTimeout('server-1', 'member-1', user),
      controller.getMyChannelPermissions('server-1', 'channel-1', user),
      controller.listOverwrites('server-1', 'channel-1', user),
      controller.upsertOverwrite('server-1', 'channel-1', 'ROLE', 'role-1', user, { allow: '4', deny: '8' }),
      controller.deleteOverwrite('server-1', 'channel-1', 'overwrite-1', user),
    ]);

    expect(servers.updateSound).toHaveBeenCalledWith('server-1', 'sound-1', 'user-1', body);
    expect(servers.banMember).toHaveBeenCalledWith('server-1', 'member-1', 'user-1', {
      reason: 'spam', deleteMessageDays: 1,
    });
    expect(servers.setMemberRole).toHaveBeenNthCalledWith(1, 'server-1', 'member-1', 'role-1', 'user-1', true);
    expect(servers.setMemberRole).toHaveBeenNthCalledWith(2, 'server-1', 'member-1', 'role-1', 'user-1', false);
    expect(servers.setTimeout.mock.calls[0][2]).toBeInstanceOf(Date);
    await expect(controller.getMyChannelPermissions('server-1', 'channel-1', user))
      .resolves.toEqual({ permissions: '513' });
    expect(() => controller.upsertOverwrite('server-1', 'channel-1', 'INVALID', 'x', user, {}))
      .toThrow('targetType must be ROLE or MEMBER');
  });

  it('maps messaging routes, cursors, decoded reactions, polls, pins, and read state', async () => {
    const messages = serviceMock();
    const controller = new MessagesController(messages as any);
    await Promise.all([
      controller.list('channel-1', user, { before: 'm1', limit: 25 }),
      controller.search('channel-1', user, { q: 'hello', limit: 10 }),
      controller.create('channel-1', user, { content: 'hello' }),
      controller.edit('message-1', user, { content: 'changed' }), controller.remove('message-1', user),
      controller.addReaction('message-1', user, { emoji: '👍' }),
      controller.removeReaction('message-1', '%F0%9F%91%8D', user),
      controller.listPins('channel-1', user), controller.setPin('message-1', user, { pinned: true }),
      controller.createPoll('channel-1', user, { question: 'Q?', options: ['A', 'B'] }),
      controller.votePoll('option-1', user),
      controller.markRead('channel-1', user, { lastReadMessageId: 'message-1' }),
      controller.getReadState('channel-1', user),
    ]);
    expect(messages.search).toHaveBeenCalledWith('channel-1', 'user-1', 'hello', { limit: 10 });
    expect(messages.removeReaction).toHaveBeenCalledWith('message-1', 'user-1', '👍');
  });

  it('maps the complete friends and blocking API to the authenticated identity', async () => {
    const friends = serviceMock();
    const controller = new FriendsController(friends as any);
    await Promise.all([
      controller.listFriends(user), controller.listPending(user), controller.listBlocked(user),
      controller.sendRequest(user, { friendCode: '12345678' }), controller.accept(user, 'request-1'),
      controller.decline(user, 'request-1'), controller.remove(user, 'friend-1'),
      controller.block(user, 'friend-1'), controller.unblock(user, 'friend-1'),
    ]);
    expect(friends.sendRequest).toHaveBeenCalledWith('user-1', { friendCode: '12345678' });
    expect(friends.remove).toHaveBeenCalledWith('user-1', 'friend-1');
  });

  it('maps bot ownership, directory, token rotation, and server installation routes', async () => {
    const bots = serviceMock();
    const controller = new BotsController(bots as any);
    const serverController = new ServerBotsController(bots as any);
    await Promise.all([
      controller.create(user, { username: 'helper' }), controller.create(user, null as any),
      controller.mine(user), controller.directory(), controller.update(user, 'bot-1', { published: true }),
      controller.resetToken(user, 'bot-1'), controller.remove(user, 'bot-1'),
      serverController.add(user, 'server-1', 'bot-1'), serverController.remove(user, 'server-1', 'bot-1'),
    ]);
    expect(bots.addToServer).toHaveBeenCalledWith('user-1', 'server-1', 'bot-1');
  });

  it('maps watch-party library, proxy, lifecycle, and host-state operations', async () => {
    const wp = serviceMock();
    const controller = new WatchPartyController(wp as any);
    const req = { headers: {}, query: {} } as any;
    const res = {} as any;
    await Promise.all([
      controller.search({ q: 'movie', type: 'movie' }, user), controller.image('item-1', res),
      controller.stream('item-1', req, res), controller.get('channel-1', user),
      controller.start('channel-1', user, { youtubeId: 'abc12345' }),
      controller.state('channel-1', user, { positionMs: 1000, paused: false }),
      controller.stop('channel-1', user),
    ]);
    expect(wp.proxyStream).toHaveBeenCalledWith('item-1', req, res);
    expect(wp.updateState).toHaveBeenCalledWith('channel-1', 'user-1', { positionMs: 1000, paused: false });
  });
});
