import { NotFoundException } from '@nestjs/common';
import { MessagesService } from './messages.service';

describe('MessagesService shared read position', () => {
  function harness(overrides: Record<string, any> = {}) {
    const prisma: any = {
      channel: { findUnique: jest.fn().mockResolvedValue({ serverId: null }) },
      channelRecipient: { findUnique: jest.fn().mockResolvedValue({}) },
      message: {
        findFirst: jest.fn().mockResolvedValue({ id: 'new', createdAt: new Date('2026-07-31T12:00:00Z') }),
        findUnique: jest.fn(),
      },
      readState: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
      },
      ...overrides,
    };
    return {
      prisma,
      service: new MessagesService(prisma, {} as any, {} as any, {} as any, {} as any),
    };
  }

  it('returns the server-persisted marker for another client to resume from', async () => {
    const { prisma, service } = harness();
    prisma.readState.findUnique.mockResolvedValue({ lastReadMessageId: 'message-42' });
    prisma.message.findFirst.mockResolvedValue({ id: 'message-42' });

    await expect(service.getReadState('channel-1', 'user-1')).resolves.toEqual({
      lastReadMessageId: 'message-42',
      latestMessageId: 'message-42',
    });
  });

  it('persists a newer visible message and clears mentions', async () => {
    const { prisma, service } = harness();

    await expect(service.markRead('channel-1', 'user-1', 'new')).resolves.toEqual({
      success: true,
      lastReadMessageId: 'new',
    });
    expect(prisma.readState.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: { lastReadMessageId: 'new', mentionCount: 0 },
    }));
  });

  it('does not move the shared marker backwards while browsing old history', async () => {
    const { prisma, service } = harness();
    prisma.readState.findUnique.mockResolvedValue({ lastReadMessageId: 'current' });
    prisma.message.findUnique.mockResolvedValue({
      channelId: 'channel-1',
      createdAt: new Date('2026-07-31T13:00:00Z'),
    });

    await expect(service.markRead('channel-1', 'user-1', 'older')).resolves.toEqual({
      success: true,
      lastReadMessageId: 'current',
    });
    expect(prisma.readState.upsert).not.toHaveBeenCalled();
  });

  it('rejects a marker that is not an active message in the channel', async () => {
    const { prisma, service } = harness();
    prisma.message.findFirst.mockResolvedValue(null);

    await expect(service.markRead('channel-1', 'user-1', 'elsewhere')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.readState.upsert).not.toHaveBeenCalled();
  });

  it('pages forward from an around-window cursor so the client can reach newest', async () => {
    const { prisma, service } = harness();
    prisma.message.findUnique.mockResolvedValue({
      channelId: 'channel-1',
      createdAt: new Date('2026-07-31T12:00:00Z'),
    });
    const message = (id: string, minute: number) => ({
      id, channelId: 'channel-1', authorId: 'author-1', content: id,
      createdAt: new Date(`2026-07-31T12:${String(minute).padStart(2, '0')}:00Z`),
      editedAt: null, deletedAt: null, replyToId: null, pinned: false,
      author: { id: 'author-1', username: 'owner', displayName: null, avatarUrl: null, status: 'ONLINE', isBot: false },
      attachments: [], reactions: [], replyTo: null, poll: null,
    });
    prisma.message.findMany = jest.fn().mockResolvedValue([message('next-1', 1), message('next-2', 2)]);

    const page = await service.list('channel-1', 'user-1', { after: 'cursor', limit: 2 });

    expect(prisma.message.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ channelId: 'channel-1', createdAt: { gt: new Date('2026-07-31T12:00:00Z') } }),
      orderBy: { createdAt: 'asc' },
      take: 3,
    }));
    expect(page.map((item) => item.id)).toEqual(['next-2', 'next-1']);
  });
});
