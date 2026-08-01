import { MessagesService } from './messages.service';

describe('MessagesService channel search', () => {
  function harness() {
    const prisma: any = {
      channel: { findUnique: jest.fn().mockResolvedValue({ serverId: null }) },
      channelRecipient: { findUnique: jest.fn().mockResolvedValue({}) },
      message: { findMany: jest.fn().mockResolvedValue([]) },
    };
    return {
      prisma,
      service: new MessagesService(prisma, {} as any, {} as any, {} as any, {} as any),
    };
  }

  it('matches the trimmed query against message content or author username', async () => {
    const { prisma, service } = harness();

    await expect(service.search('channel-1', 'user-1', '  Alice  ', { limit: 25 })).resolves.toEqual([]);

    expect(prisma.message.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        channelId: 'channel-1',
        deletedAt: null,
        OR: [
          { content: { contains: 'Alice', mode: 'insensitive' } },
          { author: { username: { contains: 'Alice', mode: 'insensitive' } } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 25,
    }));
  });

  it('does not query messages for a search shorter than two characters', async () => {
    const { prisma, service } = harness();

    await expect(service.search('channel-1', 'user-1', ' a ')).resolves.toEqual([]);
    expect(prisma.message.findMany).not.toHaveBeenCalled();
  });
});
