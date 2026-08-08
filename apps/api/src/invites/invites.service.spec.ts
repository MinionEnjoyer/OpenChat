import { BadRequestException } from '@nestjs/common';
import { InvitesService } from './invites.service';

describe('InvitesService usage limits', () => {
  it('atomically rejects a raced one-use invite', async () => {
    const inviteRecord = {
      id: 'invite-1', code: 'one-use-code', serverId: 'server-1', inviterId: 'owner-1',
      channelId: null, maxUses: 1, uses: 0, expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      server: {
        id: 'server-1', name: 'Creator server', ownerId: 'owner-1', iconUrl: null,
        createdAt: new Date(), updatedAt: new Date(),
      },
    };
    const tx = {
      invite: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      serverMember: { create: jest.fn() },
    };
    const prisma = {
      invite: { findUnique: jest.fn().mockResolvedValue(inviteRecord) },
      ban: { findUnique: jest.fn().mockResolvedValue(null) },
      serverMember: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new InvitesService(prisma as any, {} as any, {} as any);

    await expect(service.acceptInvite('one-use-code', 'supporter-2')).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.invite.updateMany).toHaveBeenCalledWith({
      where: { id: 'invite-1', uses: { lt: 1 } },
      data: { uses: { increment: 1 } },
    });
    expect(tx.serverMember.create).not.toHaveBeenCalled();
  });
});
