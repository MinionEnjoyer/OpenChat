import { BadRequestException } from '@nestjs/common';
import { ServersService } from './servers.service';

describe('ServersService primary channel protection', () => {
  it('refuses to delete the server primary channel', async () => {
    const prisma = {
      channel: {
        findUnique: jest.fn().mockResolvedValue({ serverId: 'server-1', isDefault: true }),
        delete: jest.fn(),
      },
    };
    const service = new ServersService(
      prisma as any,
      { publish: jest.fn() } as any,
      {} as any,
      { write: jest.fn() } as any,
    );
    (service as any).assertPermission = jest.fn().mockResolvedValue(undefined);

    await expect(service.deleteChannel('server-1', 'general-1', 'owner-1'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.channel.delete).not.toHaveBeenCalled();
  });
});
