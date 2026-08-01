import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Permission } from '../permissions/permissions';
import { ServersService } from './servers.service';

function harness() {
  const prisma = {
    serverSticker: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
  };
  const service = new ServersService(
    prisma as any,
    { publish: jest.fn() } as any,
    {} as any,
    { write: jest.fn() } as any,
  );
  return { prisma, service };
}

describe('ServersService sticker lifecycle', () => {
  it('lists stickers only after checking server membership', async () => {
    const { prisma, service } = harness();
    const stickers = [{ id: 'sticker-1', name: 'Wave', url: '/api/media/asset-1/raw' }];
    jest.spyOn(service, 'get').mockResolvedValue({} as any);
    prisma.serverSticker.findMany.mockResolvedValue(stickers);

    await expect(service.listStickers('server-1', 'member-1')).resolves.toEqual(stickers);
    expect(service.get).toHaveBeenCalledWith('server-1', 'member-1');
    expect(prisma.serverSticker.findMany).toHaveBeenCalledWith({
      where: { serverId: 'server-1' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, url: true },
    });
  });

  it('creates a sticker after permission and capacity checks', async () => {
    const { prisma, service } = harness();
    (service as any).assertPermission = jest.fn().mockResolvedValue(undefined);
    prisma.serverSticker.count.mockResolvedValue(12);
    prisma.serverSticker.create.mockResolvedValue({ id: 'sticker-1', name: 'A'.repeat(40), url: '/api/media/asset-1/raw' });

    await service.addSticker('server-1', 'manager-1', {
      name: 'A'.repeat(45),
      url: '/api/media/asset-1/raw',
    });

    expect((service as any).assertPermission).toHaveBeenCalledWith(
      'server-1', 'manager-1', Permission.MANAGE_CHANNELS,
    );
    expect(prisma.serverSticker.count).toHaveBeenCalledWith({ where: { serverId: 'server-1' } });
    expect(prisma.serverSticker.create).toHaveBeenCalledWith({
      data: { serverId: 'server-1', name: 'A'.repeat(40), url: '/api/media/asset-1/raw' },
      select: { id: true, name: true, url: true },
    });
  });

  it('rejects creation when permission is missing or the server is full', async () => {
    const denied = harness();
    (denied.service as any).assertPermission = jest.fn().mockRejectedValue(new ForbiddenException());
    await expect(denied.service.addSticker('server-1', 'member-1', { name: 'Wave', url: '/api/media/a/raw' }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(denied.prisma.serverSticker.count).not.toHaveBeenCalled();

    const full = harness();
    (full.service as any).assertPermission = jest.fn().mockResolvedValue(undefined);
    full.prisma.serverSticker.count.mockResolvedValue(200);
    await expect(full.service.addSticker('server-1', 'manager-1', { name: 'Wave', url: '/api/media/a/raw' }))
      .rejects.toThrow('This server is at its sticker limit (200).');
    expect(full.prisma.serverSticker.create).not.toHaveBeenCalled();
  });

  it('deletes only a sticker belonging to the requested server', async () => {
    const mismatch = harness();
    (mismatch.service as any).assertPermission = jest.fn().mockResolvedValue(undefined);
    mismatch.prisma.serverSticker.findUnique.mockResolvedValue({ serverId: 'server-2' });
    await expect(mismatch.service.deleteSticker('server-1', 'sticker-1', 'manager-1'))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(mismatch.prisma.serverSticker.delete).not.toHaveBeenCalled();

    const valid = harness();
    (valid.service as any).assertPermission = jest.fn().mockResolvedValue(undefined);
    valid.prisma.serverSticker.findUnique.mockResolvedValue({ serverId: 'server-1' });
    await expect(valid.service.deleteSticker('server-1', 'sticker-1', 'manager-1'))
      .resolves.toEqual({ success: true });
    expect(valid.prisma.serverSticker.delete).toHaveBeenCalledWith({ where: { id: 'sticker-1' } });
  });
});
