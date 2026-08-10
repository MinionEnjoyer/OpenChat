import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MessageKind } from '@prisma/client';
import { Permission } from '../permissions/permissions';
import { MessagesService } from './messages.service';

describe('MessagesService core behavior', () => {
  const createdAt = new Date('2026-08-09T12:00:00.000Z');
  function message(overrides: Record<string, any> = {}) {
    return {
      id: 'message-1', channelId: 'channel-1', authorId: 'user-1', content: 'hello',
      createdAt, editedAt: null, deletedAt: null, replyToId: null, pinned: false,
      kind: MessageKind.USER,
      author: {
        id: 'user-1', username: 'author', displayName: 'Author', avatarUrl: null,
        status: 'ONLINE', isBot: false,
      },
      attachments: [], reactions: [], replyTo: null, poll: null,
      ...overrides,
    };
  }

  function makeService() {
    const table = () => ({
      findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(),
      create: jest.fn(), update: jest.fn(), upsert: jest.fn(), delete: jest.fn(), deleteMany: jest.fn(),
    });
    const prisma: any = {
      channel: table(), serverMember: table(), channelRecipient: table(), message: table(),
      role: table(), server: table(), pollOption: table(), pollVote: table(), reaction: table(),
      readState: table(), user: table(),
    };
    prisma.channel.findUnique.mockResolvedValue({ serverId: 'server-1', name: 'general' });
    prisma.serverMember.findUnique.mockResolvedValue({ roles: [{ permissions: Permission.MANAGE_MESSAGES }] });
    prisma.serverMember.findMany.mockResolvedValue([]);
    prisma.channelRecipient.findUnique.mockResolvedValue({ userId: 'user-1' });
    prisma.channelRecipient.findMany.mockResolvedValue([]);
    prisma.message.findMany.mockResolvedValue([]);
    prisma.message.findUniqueOrThrow.mockResolvedValue(message());
    prisma.message.create.mockResolvedValue(message());
    prisma.message.update.mockResolvedValue(message());
    prisma.role.findMany.mockResolvedValue([]);
    prisma.server.findUnique.mockResolvedValue({ ownerId: 'owner-1' });
    prisma.user.findUnique.mockResolvedValue({ displayName: 'Author', username: 'author' });
    prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
    const redis = { publish: jest.fn().mockResolvedValue(1) } as any;
    const auditLog = { write: jest.fn().mockResolvedValue(undefined) } as any;
    const servers = {
      assertNotTimedOut: jest.fn().mockResolvedValue(undefined),
      getChannelPermissions: jest.fn().mockResolvedValue(Permission.SEND_MESSAGES),
    } as any;
    const presence = { isActive: jest.fn().mockReturnValue(true) } as any;
    const federation = { recordLocalEvent: jest.fn().mockResolvedValue(undefined) } as any;
    return {
      service: new MessagesService(prisma, redis, auditLog, servers, presence, federation),
      prisma, redis, auditLog, servers, presence, federation,
    };
  }

  it('enforces server membership and DM participation with channel-hiding errors', async () => {
    const missing = makeService();
    missing.prisma.channel.findUnique.mockResolvedValue(null);
    await expect(missing.service.assertChannelAccess('missing', 'user-1')).rejects.toBeInstanceOf(NotFoundException);

    const outsider = makeService();
    outsider.prisma.serverMember.findUnique.mockResolvedValue(null);
    await expect(outsider.service.assertChannelAccess('channel-1', 'user-1')).rejects.toBeInstanceOf(ForbiddenException);

    const dm = makeService();
    dm.prisma.channel.findUnique.mockResolvedValue({ serverId: null });
    dm.prisma.channelRecipient.findUnique.mockResolvedValue(null);
    await expect(dm.service.assertChannelAccess('dm-1', 'user-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lists newest-first messages with before and after cursors', async () => {
    const { service, prisma } = makeService();
    prisma.message.findMany.mockResolvedValue([message({ id: 'm2' }), message({ id: 'm1' })]);
    await expect(service.list('channel-1', 'user-1', { limit: 2 })).resolves.toHaveLength(2);
    expect(prisma.message.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 3 }));

    prisma.message.findUnique.mockResolvedValue({ createdAt, channelId: 'channel-1' });
    await service.list('channel-1', 'user-1', { before: 'm1', limit: 2 });
    expect(prisma.message.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({ createdAt: { lt: createdAt } }),
    }));

    prisma.message.findMany.mockResolvedValue([message({ id: 'm2' }), message({ id: 'm3' })]);
    const after = await service.list('channel-1', 'user-1', { after: 'm1', limit: 2 });
    expect(after.map((m) => m.id)).toEqual(['m3', 'm2']);
    prisma.message.findUnique.mockResolvedValue({ createdAt, channelId: 'other' });
    await expect(service.list('channel-1', 'user-1', { after: 'm1' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('builds a centered around-page and pads the short side', async () => {
    const { service, prisma } = makeService();
    prisma.message.findUnique.mockResolvedValue({
      id: 'target', channelId: 'channel-1', createdAt, deletedAt: null,
    });
    prisma.message.findMany
      .mockResolvedValueOnce([message({ id: 'newer', createdAt: new Date(createdAt.getTime() + 1) })])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([message({ id: 'older', createdAt: new Date(createdAt.getTime() - 1) })]);
    prisma.message.findUniqueOrThrow.mockResolvedValue(message({ id: 'target' }));
    const result = await service.list('channel-1', 'user-1', { around: 'target', limit: 3 });
    expect(result.map((m) => m.id)).toEqual(['older', 'newer', 'target']);

    prisma.message.findUnique.mockResolvedValue({ id: 'target', channelId: 'other', createdAt, deletedAt: null });
    await expect(service.list('channel-1', 'user-1', { around: 'target' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates relation-complete messages, validates reply scope, and broadcasts/federates them', async () => {
    const { service, prisma, servers, redis, federation } = makeService();
    prisma.message.findUnique.mockResolvedValue({ channelId: 'other' });
    prisma.message.create.mockResolvedValue(message({
      attachments: [{
        id: 'att-1', messageId: 'message-1', shareAssetId: 'asset-1', filename: 'image.png',
        mimeType: 'image/png', size: 12n, url: '/raw', thumbnailUrl: null,
        width: 1, height: 1, durationMs: null,
      }],
      reactions: [{ emoji: '👍', userId: 'user-1' }, { emoji: '👍', userId: 'user-2' }],
      replyTo: { id: 'parent', content: 'parent text', author: { displayName: null, username: 'parent' } },
    }));
    const dto = await service.create('channel-1', 'user-1', {
      content: 'hello', nonce: 'nonce-1', replyToId: '00000000-0000-4000-8000-000000000001',
      attachments: [{
        shareAssetId: 'asset-1', filename: 'image.png', mimeType: 'image/png', size: 12,
        url: '/api/media/asset-1/raw', thumbnailUrl: null, width: 1, height: 1, durationMs: null,
      }],
    });
    expect(servers.assertNotTimedOut).toHaveBeenCalledWith('server-1', 'user-1');
    expect(prisma.message.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ replyToId: null }),
    }));
    expect(dto.attachments[0].size).toBe('12');
    expect(dto.reactions).toEqual([{ emoji: '👍', count: 2, userIds: ['user-1', 'user-2'] }]);
    expect(dto.replyTo).toMatchObject({ authorName: 'parent' });
    expect(redis.publish).toHaveBeenCalledWith('chat:events', {
      type: 'MESSAGE_CREATED', message: dto, nonce: 'nonce-1',
    });
    expect(federation.recordLocalEvent).toHaveBeenCalledWith('MESSAGE_CREATED', 'message-1', expect.any(Object));
  });

  it('rejects server sends without channel SEND_MESSAGES permission', async () => {
    const { service, servers, prisma } = makeService();
    servers.getChannelPermissions.mockResolvedValue(Permission.READ_MESSAGES);
    await expect(service.create('channel-1', 'user-1', { content: 'blocked' }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('creates polls with ordered options and serializes voter state', async () => {
    jest.useFakeTimers().setSystemTime(createdAt);
    const { service, prisma, redis } = makeService();
    prisma.message.create.mockResolvedValue(message({
      content: 'Question?',
      poll: {
        id: 'poll-1', question: 'Question?', multiple: false,
        closesAt: new Date(createdAt.getTime() + 60_000),
        options: [{ id: 'o1', text: 'A', votes: [{ userId: 'user-2' }] }],
      },
    }));
    const result = await service.createPoll('channel-1', 'user-1', {
      question: 'Question?', options: ['A', 'B'], durationMinutes: 1,
    });
    expect(prisma.message.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ poll: { create: expect.objectContaining({
        options: { create: [{ text: 'A', position: 0 }, { text: 'B', position: 1 }] },
      }) } }),
    }));
    expect(result.poll?.options[0].voterIds).toEqual(['user-2']);
    expect(redis.publish).toHaveBeenCalledWith('chat:events', expect.objectContaining({ type: 'MESSAGE_CREATED' }));
    jest.useRealTimers();
  });

  it('toggles poll votes, clears single-choice peers, and rejects closed polls', async () => {
    const baseOption = {
      id: 'option-1', poll: {
        multiple: false, closesAt: null,
        message: { id: 'message-1', channelId: 'channel-1' },
        options: [{ id: 'option-1' }, { id: 'option-2' }],
      },
    };
    const add = makeService();
    add.prisma.pollOption.findUnique.mockResolvedValue(baseOption);
    add.prisma.pollVote.findUnique.mockResolvedValue(null);
    await add.service.votePollOption('option-1', 'user-1');
    expect(add.prisma.pollVote.deleteMany).toHaveBeenCalled();
    expect(add.prisma.pollVote.create).toHaveBeenCalledWith({ data: { optionId: 'option-1', userId: 'user-1' } });

    const remove = makeService();
    remove.prisma.pollOption.findUnique.mockResolvedValue(baseOption);
    remove.prisma.pollVote.findUnique.mockResolvedValue({ id: 'vote-1' });
    await remove.service.votePollOption('option-1', 'user-1');
    expect(remove.prisma.pollVote.delete).toHaveBeenCalledWith({ where: { id: 'vote-1' } });

    const closed = makeService();
    closed.prisma.pollOption.findUnique.mockResolvedValue({
      ...baseOption, poll: { ...baseOption.poll, closesAt: new Date(Date.now() - 1000) },
    });
    await expect(closed.service.votePollOption('option-1', 'user-1')).rejects.toBeInstanceOf(ForbiddenException);
    const missing = makeService();
    missing.prisma.pollOption.findUnique.mockResolvedValue(null);
    await expect(missing.service.votePollOption('missing', 'user-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('edits only user-authored messages and publishes/federates the update', async () => {
    const { service, prisma, redis, federation } = makeService();
    prisma.message.findUnique.mockResolvedValue(message());
    prisma.message.update.mockResolvedValue(message({ content: 'changed', editedAt: createdAt }));
    await service.edit('message-1', 'user-1', { content: 'changed' });
    expect(redis.publish).toHaveBeenCalledWith('chat:events', expect.objectContaining({ type: 'MESSAGE_UPDATED' }));
    expect(federation.recordLocalEvent).toHaveBeenCalledWith('MESSAGE_UPDATED', 'message-1', expect.any(Object));

    prisma.message.findUnique.mockResolvedValue(message({ kind: MessageKind.MEMBER_JOINED }));
    await expect(service.edit('message-1', 'user-1', { content: 'x' })).rejects.toBeInstanceOf(ForbiddenException);
    prisma.message.findUnique.mockResolvedValue(message({ authorId: 'other' }));
    await expect(service.edit('message-1', 'user-1', { content: 'x' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows author and authorized moderator deletes while auditing moderation', async () => {
    const author = makeService();
    author.prisma.message.findUnique.mockResolvedValue(message({ channel: { serverId: 'server-1' } }));
    author.prisma.message.update.mockResolvedValue({ id: 'message-1', channelId: 'channel-1', deletedAt: createdAt });
    await expect(author.service.remove('message-1', 'user-1')).resolves.toMatchObject({ id: 'message-1' });
    expect(author.auditLog.write).not.toHaveBeenCalled();

    const moderator = makeService();
    moderator.prisma.message.findUnique.mockResolvedValue(message({ authorId: 'other', channel: { serverId: 'server-1' } }));
    moderator.prisma.message.update.mockResolvedValue({ id: 'message-1', channelId: 'channel-1', deletedAt: createdAt });
    await moderator.service.remove('message-1', 'moderator');
    expect(moderator.auditLog.write).toHaveBeenCalledWith(expect.objectContaining({ action: 'MESSAGE_DELETE' }));
    expect(moderator.federation.recordLocalEvent).toHaveBeenCalledWith('MESSAGE_DELETED', 'message-1', expect.any(Object));

    const denied = makeService();
    denied.prisma.message.findUnique.mockResolvedValue(message({ authorId: 'other', channel: { serverId: null } }));
    await expect(denied.service.remove('message-1', 'user-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('pins server messages with moderation permission and permits DM participant pins', async () => {
    const server = makeService();
    server.prisma.message.findUnique.mockResolvedValue(message({ channel: { serverId: 'server-1' } }));
    await server.service.setPinned('message-1', 'user-1', true);
    expect(server.auditLog.write).toHaveBeenCalledWith(expect.objectContaining({ action: 'MESSAGE_PIN' }));

    const denied = makeService();
    denied.prisma.message.findUnique.mockResolvedValue(message({ channel: { serverId: 'server-1' } }));
    denied.prisma.serverMember.findUnique.mockResolvedValue({ roles: [] });
    await expect(denied.service.setPinned('message-1', 'user-1', true)).rejects.toBeInstanceOf(ForbiddenException);

    const dm = makeService();
    dm.prisma.channel.findUnique.mockResolvedValue({ serverId: null });
    dm.prisma.message.findUnique.mockResolvedValue(message({ channel: { serverId: null } }));
    await expect(dm.service.setPinned('message-1', 'user-1', false)).resolves.toMatchObject({ id: 'message-1' });
  });

  it('lists pinned messages and adds/removes idempotent reactions with updates', async () => {
    const { service, prisma, redis } = makeService();
    prisma.message.findMany.mockResolvedValue([message({ pinned: true })]);
    await expect(service.listPinned('channel-1', 'user-1')).resolves.toHaveLength(1);

    prisma.message.findUnique.mockResolvedValue({ channelId: 'channel-1' });
    await service.addReaction('message-1', 'user-1', '👍');
    expect(prisma.reaction.upsert).toHaveBeenCalledWith({
      where: { messageId_userId_emoji: { messageId: 'message-1', userId: 'user-1', emoji: '👍' } },
      create: { messageId: 'message-1', userId: 'user-1', emoji: '👍' }, update: {},
    });
    await service.removeReaction('message-1', 'user-1', '👍');
    expect(prisma.reaction.deleteMany).toHaveBeenCalledWith({
      where: { messageId: 'message-1', userId: 'user-1', emoji: '👍' },
    });
    expect(redis.publish).toHaveBeenCalledWith('chat:events', expect.objectContaining({ type: 'MESSAGE_UPDATED' }));

    prisma.message.findUnique.mockResolvedValue(null);
    await expect(service.addReaction('missing', 'user-1', '👍')).rejects.toBeInstanceOf(NotFoundException);
  });
});
