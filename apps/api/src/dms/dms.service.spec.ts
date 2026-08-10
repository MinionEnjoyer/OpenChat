import { ForbiddenException } from '@nestjs/common';
import { DmsService } from './dms.service';

describe('DmsService', () => {
  const user = (id: string) => ({
    id, username: `user-${id}`, displayName: `User ${id}`, avatarUrl: `/${id}.png`, status: 'ONLINE',
  });

  function makeService() {
    const prisma = {
      friendship: { findFirst: jest.fn().mockResolvedValue({ id: 'friendship-1' }) },
      channel: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({
          id: 'dm-new', type: 'DM', recipients: [{ user: user('one') }, { user: user('two') }],
        }),
      },
    } as any;
    return { service: new DmsService(prisma), prisma };
  }

  it('rejects self-DMs before querying friendships', async () => {
    const { service, prisma } = makeService();
    await expect(service.openDm('same', 'same')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.friendship.findFirst).not.toHaveBeenCalled();
  });

  it('requires an accepted friendship in either direction', async () => {
    const { service, prisma } = makeService();
    prisma.friendship.findFirst.mockResolvedValue(null);

    await expect(service.openDm('one', 'two')).rejects.toMatchObject({
      response: expect.objectContaining({ message: 'You must be friends to open a DM' }),
    });
    expect(prisma.friendship.findFirst).toHaveBeenCalledWith({
      where: {
        status: 'ACCEPTED',
        OR: [
          { requesterId: 'one', addresseeId: 'two' },
          { requesterId: 'two', addresseeId: 'one' },
        ],
      },
    });
  });

  it('reuses only an exact two-recipient direct-message channel', async () => {
    const { service, prisma } = makeService();
    prisma.channel.findMany.mockResolvedValue([
      { id: 'group-shaped', recipients: [{ user: user('one') }, { user: user('two') }, { user: user('three') }] },
      { id: 'dm-existing', recipients: [{ user: user('one') }, { user: user('two') }] },
    ]);

    await expect(service.openDm('one', 'two')).resolves.toEqual({
      id: 'dm-existing', type: 'DM', recipients: [user('one'), user('two')], lastMessageAt: null,
    });
    expect(prisma.channel.create).not.toHaveBeenCalled();
  });

  it('creates a private two-recipient channel when one does not exist', async () => {
    const { service, prisma } = makeService();

    await expect(service.openDm('one', 'two')).resolves.toEqual({
      id: 'dm-new', type: 'DM', recipients: [user('one'), user('two')], lastMessageAt: null,
    });
    expect(prisma.channel.create).toHaveBeenCalledWith({
      data: {
        type: 'DM', serverId: null, name: '', position: 0,
        recipients: { create: [{ userId: 'one' }, { userId: 'two' }] },
      },
      include: { recipients: { include: { user: true } } },
    });
  });

  it('lists direct messages by newest non-deleted activity with empty channels last', async () => {
    const { service, prisma } = makeService();
    prisma.channel.findMany.mockResolvedValue([
      {
        id: 'empty', type: 'GROUP_DM', recipients: [{ user: user('three') }], messages: [],
      },
      {
        id: 'older', type: 'DM', recipients: [{ user: user('one') }],
        messages: [{ createdAt: new Date('2026-01-01T00:00:00.000Z') }],
      },
      {
        id: 'newer', type: 'DM', recipients: [{ user: user('two') }],
        messages: [{ createdAt: new Date('2026-02-01T00:00:00.000Z') }],
      },
    ]);

    const result = await service.listDms('one');

    expect(result.map((dm) => dm.id)).toEqual(['newer', 'older', 'empty']);
    expect(result.map((dm) => dm.lastMessageAt)).toEqual([
      '2026-02-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', null,
    ]);
    expect(prisma.channel.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        type: { in: ['DM', 'GROUP_DM'] }, recipients: { some: { userId: 'one' } },
      },
      include: expect.objectContaining({
        messages: expect.objectContaining({ where: { deletedAt: null }, take: 1 }),
      }),
    }));
  });
});
