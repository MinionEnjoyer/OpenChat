import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { BotsService } from './bots.service';
import { Permission } from '../permissions/permissions';

describe('BotsService', () => {
  function harness() {
    const bot = {
      id: 'bot-1', username: 'helper.bot', displayName: 'Helper', avatarUrl: null,
      botDescription: 'Useful helper', botPublished: false, botOwnerId: 'owner-1',
      isBot: true, createdAt: new Date('2026-08-09T00:00:00Z'),
    };
    const prisma = {
      user: {
        create: jest.fn().mockResolvedValue(bot),
        findMany: jest.fn().mockResolvedValue([bot]),
        findFirst: jest.fn().mockResolvedValue(bot),
        update: jest.fn().mockResolvedValue(bot),
        delete: jest.fn().mockResolvedValue(bot),
      },
      apiToken: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      serverMember: {
        upsert: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      role: {
        findFirst: jest.fn().mockResolvedValue(null),
        aggregate: jest.fn().mockResolvedValue({ _max: { position: 4 } }),
        create: jest.fn().mockResolvedValue({ id: 'bots-role', name: 'Bots' }),
      },
    };
    const auth = { createToken: jest.fn().mockResolvedValue({ token: 'shown-once-token' }) };
    const servers = { getMemberPermissions: jest.fn().mockResolvedValue(Permission.MANAGE_SERVER) };
    return {
      service: new BotsService(prisma as never, auth as never, servers as never),
      prisma,
      auth,
      servers,
      bot,
    };
  }

  it.each(['', 'a', 'contains spaces', 'x'.repeat(33)])(
    'rejects invalid bot username %p before writing',
    async (username) => {
      const { service, prisma } = harness();
      await expect(service.createBot('owner-1', { username })).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    },
  );

  it('creates the bot and returns its token exactly once', async () => {
    const { service, prisma, auth, bot } = harness();
    const result = await service.createBot('owner-1', {
      username: ' helper.bot ', displayName: 'Helper', description: 'Useful helper',
    });

    expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        username: 'helper.bot', botOwnerId: 'owner-1', isBot: true,
      }),
    }));
    expect(auth.createToken).toHaveBeenCalledWith('bot-1', 'Bot token');
    expect(result).toEqual({ bot, token: 'shown-once-token' });
  });

  it('lists only the caller-owned bots without token or auth-sub fields', async () => {
    const { service, prisma } = harness();
    await service.listMine('owner-1');
    const query = prisma.user.findMany.mock.calls[0][0];
    expect(query.where).toEqual({ isBot: true, botOwnerId: 'owner-1' });
    expect(query.select).not.toHaveProperty('authSub');
    expect(query.select).not.toHaveProperty('apiTokens');
  });

  it('limits the public directory to published bot accounts', async () => {
    const { service, prisma } = harness();
    await service.listDirectory();
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { isBot: true, botPublished: true },
    }));
  });

  it('does not let one owner update another owner bot', async () => {
    const { service, prisma } = harness();
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(service.updateBot('owner-2', 'bot-1', { published: true }))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('revokes every live token before minting a replacement', async () => {
    const { service, prisma, auth } = harness();
    await expect(service.resetToken('owner-1', 'bot-1')).resolves.toEqual({ token: 'shown-once-token' });
    expect(prisma.apiToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'bot-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.apiToken.updateMany.mock.invocationCallOrder[0])
      .toBeLessThan(auth.createToken.mock.invocationCallOrder[0]);
  });

  it('requires Manage Server before adding or removing a bot', async () => {
    const { service, servers, prisma } = harness();
    servers.getMemberPermissions.mockResolvedValue(0n);
    await expect(service.addToServer('member-1', 'server-1', 'bot-1'))
      .rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.removeFromServer('member-1', 'server-1', 'bot-1'))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.serverMember.upsert).not.toHaveBeenCalled();
    expect(prisma.serverMember.deleteMany).not.toHaveBeenCalled();
  });

  it('adds a bot idempotently and grants only baseline chat permissions', async () => {
    const { service, prisma } = harness();
    await expect(service.addToServer('owner-1', 'server-1', 'bot-1')).resolves.toEqual({ success: true });

    expect(prisma.serverMember.upsert).toHaveBeenCalledWith({
      where: { serverId_userId: { serverId: 'server-1', userId: 'bot-1' } },
      create: { serverId: 'server-1', userId: 'bot-1' },
      update: {},
    });
    expect(prisma.role.create).toHaveBeenCalledWith({
      data: {
        serverId: 'server-1', name: 'Bots',
        permissions: Permission.SEND_MESSAGES | Permission.READ_MESSAGES,
        position: 5,
      },
    });
    expect(prisma.serverMember.update).toHaveBeenCalledWith({
      where: { serverId_userId: { serverId: 'server-1', userId: 'bot-1' } },
      data: { roles: { connect: { id: 'bots-role' } } },
    });
  });

  it('removes only the selected bot membership', async () => {
    const { service, prisma } = harness();
    await expect(service.removeFromServer('owner-1', 'server-1', 'bot-1')).resolves.toEqual({ success: true });
    expect(prisma.serverMember.deleteMany).toHaveBeenCalledWith({
      where: { serverId: 'server-1', userId: 'bot-1' },
    });
  });
});
