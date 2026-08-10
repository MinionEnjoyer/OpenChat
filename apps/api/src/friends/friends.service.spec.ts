import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FriendsService } from './friends.service';

describe('FriendsService', () => {
  const target = {
    id: 'target-1', username: 'Target', displayName: null, avatarUrl: null, status: 'ONLINE',
  };

  function makeService() {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(target),
        findFirst: jest.fn().mockResolvedValue(target),
        findMany: jest.fn().mockResolvedValue([]),
      },
      friendship: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
        upsert: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
    } as any;
    const redis = { publish: jest.fn().mockResolvedValue(1) } as any;
    return { service: new FriendsService(prisma, redis), prisma, redis };
  }

  it('looks up trimmed friend codes and creates a pending request', async () => {
    const { service, prisma, redis } = makeService();

    await expect(service.sendRequest('user-1', { friendCode: '  CODE-123  ' })).resolves.toEqual({
      id: 'target-1', username: 'Target', displayName: null, avatarUrl: null, status: 'ONLINE',
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { friendCode: 'CODE-123' } });
    expect(prisma.friendship.upsert).toHaveBeenCalledWith({
      where: { requesterId_addresseeId: { requesterId: 'user-1', addresseeId: 'target-1' } },
      create: { requesterId: 'user-1', addresseeId: 'target-1', status: 'PENDING' },
      update: {},
    });
    expect(redis.publish).toHaveBeenCalledWith('chat:events', { type: 'NOTIFY', userId: 'target-1' });
  });

  it('uses a trimmed, case-insensitive username lookup', async () => {
    const { service, prisma } = makeService();
    await service.sendRequest('user-1', { username: '  Target  ' });
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { username: { equals: 'Target', mode: 'insensitive' } },
    });
  });

  it('returns distinct not-found messages and rejects self requests', async () => {
    const code = makeService();
    code.prisma.user.findUnique.mockResolvedValue(null);
    await expect(code.service.sendRequest('user-1', { friendCode: 'missing' }))
      .rejects.toBeInstanceOf(NotFoundException);

    const username = makeService();
    username.prisma.user.findFirst.mockResolvedValue(null);
    await expect(username.service.sendRequest('user-1', { username: 'missing' })).rejects.toMatchObject({
      response: expect.objectContaining({ message: 'User not found' }),
    });

    const self = makeService();
    self.prisma.user.findUnique.mockResolvedValue({ ...target, id: 'user-1' });
    await expect(self.service.sendRequest('user-1', { friendCode: 'self' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('automatically accepts a reverse pending request and notifies its requester', async () => {
    const { service, prisma, redis } = makeService();
    prisma.friendship.findFirst.mockResolvedValue({ id: 'reverse-1' });

    await service.sendRequest('user-1', { username: 'Target' });

    expect(prisma.friendship.update).toHaveBeenCalledWith({
      where: { id: 'reverse-1' }, data: { status: 'ACCEPTED' },
    });
    expect(prisma.friendship.upsert).not.toHaveBeenCalled();
    expect(redis.publish).toHaveBeenCalledWith('chat:events', { type: 'NOTIFY', userId: 'target-1' });
  });

  it('rejects duplicate pending or accepted relationships but permits replacing a block', async () => {
    const duplicate = makeService();
    duplicate.prisma.friendship.findUnique.mockResolvedValue({ status: 'ACCEPTED' });
    await expect(duplicate.service.sendRequest('user-1', { username: 'Target' }))
      .rejects.toBeInstanceOf(BadRequestException);

    const blocked = makeService();
    blocked.prisma.friendship.findUnique.mockResolvedValue({ status: 'BLOCKED' });
    await blocked.service.sendRequest('user-1', { username: 'Target' });
    expect(blocked.prisma.friendship.upsert).toHaveBeenCalled();
  });

  it('lists accepted friends from either relationship direction', async () => {
    const { service, prisma } = makeService();
    prisma.friendship.findMany.mockResolvedValue([
      { requesterId: 'user-1', addresseeId: 'friend-2' },
      { requesterId: 'friend-3', addresseeId: 'user-1' },
    ]);
    prisma.user.findMany.mockResolvedValue([
      { id: 'friend-2', username: 'two', displayName: 'Two', avatarUrl: '/2.png', status: 'OFFLINE' },
      { id: 'friend-3', username: 'three', displayName: null, avatarUrl: null, status: 'ONLINE' },
    ]);

    await expect(service.listFriends('user-1')).resolves.toHaveLength(2);
    expect(prisma.user.findMany).toHaveBeenCalledWith({ where: { id: { in: ['friend-2', 'friend-3'] } } });
  });

  it('separates incoming and outgoing pending requests', async () => {
    const { service, prisma } = makeService();
    prisma.friendship.findMany
      .mockResolvedValueOnce([{ id: 'incoming-1', requester: target }])
      .mockResolvedValueOnce([{ id: 'outgoing-1', addressee: { ...target, id: 'target-2' } }]);

    await expect(service.listPending('user-1')).resolves.toEqual({
      incoming: [{ id: 'incoming-1', user: expect.objectContaining({ id: 'target-1' }) }],
      outgoing: [{ id: 'outgoing-1', user: expect.objectContaining({ id: 'target-2' }) }],
    });
  });

  it('accepts only requests addressed to the acting user and notifies the requester', async () => {
    const missing = makeService();
    await expect(missing.service.accept('missing', 'user-1')).rejects.toBeInstanceOf(NotFoundException);

    const wrongUser = makeService();
    wrongUser.prisma.friendship.findUnique.mockResolvedValue({ id: 'request-1', requesterId: 'other', addresseeId: 'someone-else' });
    await expect(wrongUser.service.accept('request-1', 'user-1')).rejects.toBeInstanceOf(BadRequestException);

    const valid = makeService();
    valid.prisma.friendship.findUnique.mockResolvedValue({ id: 'request-1', requesterId: 'requester-1', addresseeId: 'user-1' });
    await valid.service.accept('request-1', 'user-1');
    expect(valid.prisma.friendship.update).toHaveBeenCalledWith({
      where: { id: 'request-1' }, data: { status: 'ACCEPTED' },
    });
    expect(valid.redis.publish).toHaveBeenCalledWith('chat:events', { type: 'NOTIFY', userId: 'requester-1' });
  });

  it('declines only requests addressed to the acting user', async () => {
    const missing = makeService();
    await expect(missing.service.decline('missing', 'user-1')).rejects.toBeInstanceOf(NotFoundException);

    const wrongUser = makeService();
    wrongUser.prisma.friendship.findUnique.mockResolvedValue({ id: 'request-1', addresseeId: 'someone-else' });
    await expect(wrongUser.service.decline('request-1', 'user-1')).rejects.toBeInstanceOf(BadRequestException);

    const valid = makeService();
    valid.prisma.friendship.findUnique.mockResolvedValue({ id: 'request-1', addresseeId: 'user-1' });
    await valid.service.decline('request-1', 'user-1');
    expect(valid.prisma.friendship.delete).toHaveBeenCalledWith({ where: { id: 'request-1' } });
  });

  it('removes accepted friendships in either direction', async () => {
    const missing = makeService();
    await expect(missing.service.remove('user-1', 'friend-1')).rejects.toBeInstanceOf(NotFoundException);

    const valid = makeService();
    valid.prisma.friendship.findFirst.mockResolvedValue({ id: 'friendship-1' });
    await valid.service.remove('user-1', 'friend-1');
    expect(valid.prisma.friendship.delete).toHaveBeenCalledWith({ where: { id: 'friendship-1' } });
  });

  it('lists, creates, updates, and removes user-owned blocks', async () => {
    const { service, prisma } = makeService();
    prisma.friendship.findMany.mockResolvedValue([{ addressee: target }]);
    await expect(service.listBlocked('user-1')).resolves.toEqual([expect.objectContaining({ id: 'target-1' })]);

    await service.block('user-1', 'target-1');
    expect(prisma.friendship.upsert).toHaveBeenCalledWith({
      where: { requesterId_addresseeId: { requesterId: 'user-1', addresseeId: 'target-1' } },
      create: { requesterId: 'user-1', addresseeId: 'target-1', status: 'BLOCKED' },
      update: { status: 'BLOCKED' },
    });

    await expect(service.unblock('user-1', 'target-1')).rejects.toBeInstanceOf(NotFoundException);
    prisma.friendship.findFirst.mockResolvedValue({ id: 'block-1' });
    await service.unblock('user-1', 'target-1');
    expect(prisma.friendship.delete).toHaveBeenCalledWith({ where: { id: 'block-1' } });
  });
});
