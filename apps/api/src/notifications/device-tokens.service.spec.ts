import { DeviceTokensService } from './device-tokens.service';

describe('DeviceTokensService', () => {
  function makeService() {
    const prisma = {
      deviceToken: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({ id: 'device-1' }),
        create: jest.fn().mockResolvedValue({ id: 'device-new' }),
        findMany: jest.fn().mockResolvedValue([]),
        delete: jest.fn().mockResolvedValue({}),
      },
    } as any;
    return { service: new DeviceTokensService(prisma), prisma };
  }

  it('creates a brand-new device token for the current user', async () => {
    const { service, prisma } = makeService();
    await expect(service.register('user-1', 'push-token', 'android')).resolves.toEqual({ id: 'device-new' });
    expect(prisma.deviceToken.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', token: 'push-token', platform: 'android' },
    });
  });

  it('refreshes or transfers an existing globally unique token', async () => {
    const { service, prisma } = makeService();
    prisma.deviceToken.findFirst.mockResolvedValue({ id: 'device-1', userId: 'old-user' });
    await service.register('new-user', 'push-token', 'ios');
    expect(prisma.deviceToken.update).toHaveBeenCalledWith({
      where: { id: 'device-1' },
      data: { userId: 'new-user', platform: 'ios', lastSeen: expect.any(Date) },
    });
    expect(prisma.deviceToken.create).not.toHaveBeenCalled();
  });

  it('lists only the current user devices by newest activity', async () => {
    const { service, prisma } = makeService();
    await service.listForUser('user-1');
    expect(prisma.deviceToken.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' }, orderBy: { lastSeen: 'desc' },
    });
  });

  it('deletes only owned tokens and treats missing tokens as already removed', async () => {
    const { service, prisma } = makeService();
    await expect(service.delete('user-1', 'missing')).resolves.toBe(false);
    expect(prisma.deviceToken.delete).not.toHaveBeenCalled();

    prisma.deviceToken.findFirst.mockResolvedValue({ id: 'device-1' });
    await expect(service.delete('user-1', 'push-token')).resolves.toBe(true);
    expect(prisma.deviceToken.findFirst).toHaveBeenLastCalledWith({
      where: { token: 'push-token', userId: 'user-1' },
    });
    expect(prisma.deviceToken.delete).toHaveBeenCalledWith({ where: { id: 'device-1' } });
  });
});
