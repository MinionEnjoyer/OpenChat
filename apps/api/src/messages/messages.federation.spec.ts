import { MessageKind } from '@prisma/client';
import { MessagesService } from './messages.service';

function serializedMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'message-1', channelId: 'channel-1', authorId: 'user-1', content: 'edited',
    createdAt: new Date('2026-08-08T07:00:00Z'), editedAt: new Date('2026-08-08T07:01:00Z'),
    deletedAt: null, replyToId: null, pinned: false, kind: MessageKind.USER,
    author: { id: 'user-1', username: 'tester', displayName: null, avatarUrl: null, status: 'ONLINE', isBot: false },
    attachments: [], reactions: [], replyTo: null, poll: null,
    ...overrides,
  };
}

describe('MessagesService mirror-cluster integration', () => {
  it('enqueues the serialized edit without delaying the API response', async () => {
    const updated = serializedMessage();
    const prisma = {
      message: {
        findUnique: jest.fn().mockResolvedValue({ id: 'message-1', authorId: 'user-1', kind: MessageKind.USER }),
        update: jest.fn().mockResolvedValue(updated),
      },
    };
    const redis = { publish: jest.fn().mockResolvedValue(undefined) };
    const federation = { recordLocalEvent: jest.fn().mockResolvedValue(undefined) };
    const service = new MessagesService(prisma as any, redis as any, {} as any, {} as any, {} as any, federation as any);

    await expect(service.edit('message-1', 'user-1', { content: 'edited' }))
      .resolves.toEqual(expect.objectContaining({ id: 'message-1', content: 'edited' }));
    expect(federation.recordLocalEvent).toHaveBeenCalledWith(
      'MESSAGE_UPDATED', 'message-1', expect.objectContaining({ id: 'message-1', content: 'edited' }),
    );
  });

  it('enqueues the tombstone used by mirrors after deletion', async () => {
    const deletedAt = new Date('2026-08-08T07:02:00Z');
    const prisma = {
      message: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'message-1', authorId: 'user-1', kind: MessageKind.USER,
          channelId: 'channel-1', channel: { serverId: null },
        }),
        update: jest.fn().mockResolvedValue({ id: 'message-1', channelId: 'channel-1', deletedAt }),
      },
    };
    const redis = { publish: jest.fn().mockResolvedValue(undefined) };
    const federation = { recordLocalEvent: jest.fn().mockResolvedValue(undefined) };
    const service = new MessagesService(prisma as any, redis as any, {} as any, {} as any, {} as any, federation as any);

    await service.remove('message-1', 'user-1');

    expect(federation.recordLocalEvent).toHaveBeenCalledWith('MESSAGE_DELETED', 'message-1', {
      id: 'message-1', channelId: 'channel-1', deletedAt: deletedAt.toISOString(),
    });
  });
});
