import { ChannelType } from '@prisma/client';
import { TestWorldService } from './test-world.service';

describe('TestWorldService', () => {
  it('provisions isolated users, tokens, server fixtures, friendship, DM, and seed messages', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-09T00:00:00.000Z'));
    const primary = { id: 'primary-1', username: 'primary' };
    const friend = { id: 'friend-1', username: 'friend' };
    const auth = { devLogin: jest.fn().mockResolvedValueOnce(primary).mockResolvedValueOnce(friend) } as any;
    const tokenService = {
      issueFamily: jest.fn().mockResolvedValue({ accessToken: 'access', expiresIn: 3600, refreshToken: 'refresh' }),
    } as any;
    let channelIndex = 0;
    let messageIndex = 0;
    const prisma = {
      server: { create: jest.fn().mockResolvedValue({ id: 'server-1', name: 'Test Server' }) },
      serverMember: { create: jest.fn().mockResolvedValue({}) },
      channel: { create: jest.fn(async ({ data }: any) => ({ id: `channel-${++channelIndex}`, ...data })) },
      friendship: { create: jest.fn().mockResolvedValue({}) },
      channelRecipient: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
      message: { create: jest.fn(async () => ({ id: `message-${++messageIndex}` })) },
    } as any;
    const service = new TestWorldService(prisma, auth, tokenService);

    const result = await service.provision('mobile acceptance label longer than twenty-four characters');

    expect(auth.devLogin).toHaveBeenCalledTimes(2);
    expect(tokenService.issueFamily).toHaveBeenCalledWith('primary-1');
    expect(prisma.serverMember.create).toHaveBeenCalledTimes(2);
    expect(prisma.channel.create).toHaveBeenNthCalledWith(1, { data: expect.objectContaining({
      name: 'general', type: ChannelType.TEXT, isDefault: true,
    }) });
    expect(prisma.channel.create).toHaveBeenNthCalledWith(3, { data: expect.objectContaining({ type: ChannelType.VOICE }) });
    expect(prisma.channel.create).toHaveBeenNthCalledWith(4, { data: expect.objectContaining({ type: ChannelType.DM }) });
    expect(prisma.friendship.create).toHaveBeenCalledWith({ data: {
      requesterId: 'primary-1', addresseeId: 'friend-1', status: 'ACCEPTED',
    } });
    expect(prisma.channelRecipient.createMany).toHaveBeenCalledWith({ data: [
      { channelId: 'channel-4', userId: 'primary-1' },
      { channelId: 'channel-4', userId: 'friend-1' },
    ] });
    expect(result.fixtures.messageIds).toEqual(['message-1', 'message-2', 'message-3']);
    expect(result.fixtures.channels).toEqual({ general: 'channel-1', random: 'channel-2', voice: 'channel-3' });
    jest.useRealTimers();
  });

  it('provisions cleanly without an optional label', async () => {
    const auth = {
      devLogin: jest.fn()
        .mockResolvedValueOnce({ id: 'primary-1', username: 'primary' })
        .mockResolvedValueOnce({ id: 'friend-1', username: 'friend' }),
    } as any;
    const tokens = { issueFamily: jest.fn().mockResolvedValue({}) } as any;
    let channelIndex = 0;
    const prisma = {
      server: { create: jest.fn().mockResolvedValue({ id: 'server-1', name: 'TW server' }) },
      serverMember: { create: jest.fn() },
      channel: { create: jest.fn(async ({ data }: any) => ({ id: `c${++channelIndex}`, ...data })) },
      friendship: { create: jest.fn() }, channelRecipient: { createMany: jest.fn() },
      message: { create: jest.fn().mockResolvedValue({ id: 'm' }) },
    } as any;
    await expect(new TestWorldService(prisma, auth, tokens).provision()).resolves.toMatchObject({
      userId: 'primary-1', fixtures: { serverId: 'server-1' },
    });
  });
});
