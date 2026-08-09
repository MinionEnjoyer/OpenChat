import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  function makeService() {
    const friends = { listPending: jest.fn().mockResolvedValue({ incoming: [], outgoing: [] }) } as any;
    const servers = { listIncomingInvitations: jest.fn().mockResolvedValue([]) } as any;
    const prisma = {
      notificationSetting: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({ id: 'setting-1' }),
        findFirst: jest.fn().mockResolvedValue(null),
        delete: jest.fn().mockResolvedValue({}),
      },
    } as any;
    return { service: new NotificationsService(friends, servers, prisma), friends, servers, prisma };
  }

  it('aggregates incoming friend requests and server invitations', async () => {
    const { service, friends, servers } = makeService();
    friends.listPending.mockResolvedValue({ incoming: [{ id: 'friend-1' }], outgoing: [{ id: 'outgoing' }] });
    servers.listIncomingInvitations.mockResolvedValue([{ id: 'invite-1' }, { id: 'invite-2' }]);

    await expect(service.getForUser('user-1')).resolves.toEqual({
      friendRequests: [{ id: 'friend-1' }],
      serverInvites: [{ id: 'invite-1' }, { id: 'invite-2' }],
      count: 3,
    });
  });

  it('lists settings in stable scope order for only the current user', async () => {
    const { service, prisma } = makeService();
    await service.getSettings('user-1');
    expect(prisma.notificationSetting.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' }, orderBy: { scope: 'asc' },
    });
  });

  it('upserts notification levels and converts optional mute timestamps', async () => {
    const { service, prisma } = makeService();
    await service.upsertSetting('user-1', {
      scope: 'CHANNEL', scopeId: 'channel-1', level: 'MENTIONS', mutedUntil: '2026-09-01T12:00:00.000Z',
    } as any);
    expect(prisma.notificationSetting.upsert).toHaveBeenCalledWith({
      where: { userId_scope_scopeId: { userId: 'user-1', scope: 'CHANNEL', scopeId: 'channel-1' } },
      create: {
        userId: 'user-1', scope: 'CHANNEL', scopeId: 'channel-1', level: 'MENTIONS',
        mutedUntil: new Date('2026-09-01T12:00:00.000Z'),
      },
      update: { level: 'MENTIONS', mutedUntil: new Date('2026-09-01T12:00:00.000Z') },
    });

    await service.upsertSetting('user-1', {
      scope: 'GLOBAL', scopeId: 'all', level: 'ALL', mutedUntil: null,
    } as any);
    expect(prisma.notificationSetting.upsert).toHaveBeenLastCalledWith(expect.objectContaining({
      create: expect.objectContaining({ mutedUntil: null }), update: expect.objectContaining({ mutedUntil: null }),
    }));
  });

  it('deletes only settings owned by the current user and is idempotent when absent', async () => {
    const { service, prisma } = makeService();
    await expect(service.deleteSetting('user-1', 'missing')).resolves.toBeNull();
    expect(prisma.notificationSetting.delete).not.toHaveBeenCalled();

    prisma.notificationSetting.findFirst.mockResolvedValue({ id: 'setting-1' });
    await expect(service.deleteSetting('user-1', 'setting-1')).resolves.toEqual({ success: true });
    expect(prisma.notificationSetting.findFirst).toHaveBeenLastCalledWith({
      where: { id: 'setting-1', userId: 'user-1' },
    });
    expect(prisma.notificationSetting.delete).toHaveBeenCalledWith({ where: { id: 'setting-1' } });
  });
});
