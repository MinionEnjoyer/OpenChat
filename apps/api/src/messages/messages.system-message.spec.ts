import { ForbiddenException } from '@nestjs/common';
import { MessageKind } from '@prisma/client';
import { MessagesService } from './messages.service';

describe('MessagesService server activity immutability', () => {
  function serviceFor(kind: MessageKind) {
    const prisma = {
      message: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'message-1',
          authorId: 'member-1',
          kind,
          channel: { serverId: 'server-1' },
        }),
        update: jest.fn(),
      },
    };
    const service = new MessagesService(
      prisma as any,
      { publish: jest.fn() } as any,
      { write: jest.fn() } as any,
      {} as any,
      {} as any,
    );
    return { prisma, service };
  }

  it.each([MessageKind.MEMBER_JOINED, MessageKind.MEMBER_LEFT])(
    'prevents editing %s activity',
    async (kind) => {
      const { prisma, service } = serviceFor(kind);
      await expect(service.edit('message-1', 'member-1', { content: 'spoofed' }))
        .rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.message.update).not.toHaveBeenCalled();
    },
  );

  it.each([MessageKind.MEMBER_JOINED, MessageKind.MEMBER_LEFT])(
    'prevents deleting %s activity',
    async (kind) => {
      const { prisma, service } = serviceFor(kind);
      await expect(service.remove('message-1', 'member-1'))
        .rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.message.update).not.toHaveBeenCalled();
    },
  );
});
