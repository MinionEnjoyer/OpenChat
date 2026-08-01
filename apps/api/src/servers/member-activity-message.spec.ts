import {
  createMemberActivityMessage,
  serializeMemberActivityMessage,
} from './member-activity-message';
import { MessageKind } from '@prisma/client';

function mockDb(channelId: string | null = 'channel-general') {
  const message = {
    id: 'message-1',
    channelId: channelId ?? 'unused',
    authorId: 'user-1',
    content: '',
    kind: MessageKind.MEMBER_JOINED,
    createdAt: new Date('2026-08-01T12:00:00.000Z'),
    author: {
      id: 'user-1',
      username: 'vin_min',
      displayName: 'Vin',
      avatarUrl: null,
      status: 'ONLINE',
      isBot: false,
    },
    attachments: [],
    reactions: [],
    replyTo: null,
    poll: null,
  };
  return {
    db: {
      channel: { findFirst: jest.fn().mockResolvedValue(channelId ? { id: channelId } : null) },
      message: { create: jest.fn().mockResolvedValue(message) },
    } as any,
    message,
  };
}

describe('member activity messages', () => {
  it.each([
    ['joined', MessageKind.MEMBER_JOINED],
    ['left', MessageKind.MEMBER_LEFT],
  ] as const)('persists %s activity as a server-owned message kind', async (activity, kind) => {
    const { db } = mockDb();

    await createMemberActivityMessage(db, 'server-1', 'user-1', activity);

    expect(db.channel.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { serverId: 'server-1', isDefault: true },
    }));
    expect(db.message.create).toHaveBeenCalledWith(expect.objectContaining({
      data: { channelId: 'channel-general', authorId: 'user-1', content: '', kind },
    }));
  });

  it('does not create a message when the server has no chat-capable channel', async () => {
    const { db } = mockDb(null);
    await expect(createMemberActivityMessage(db, 'server-1', 'user-1', 'joined')).resolves.toBeNull();
    expect(db.message.create).not.toHaveBeenCalled();
  });

  it('serializes onto the normal message wire contract', () => {
    const { message } = mockDb();
    expect(serializeMemberActivityMessage(message)).toEqual(expect.objectContaining({
      id: 'message-1',
      content: '',
      kind: MessageKind.MEMBER_JOINED,
      createdAt: '2026-08-01T12:00:00.000Z',
      author: expect.objectContaining({ username: 'vin_min' }),
      attachments: [],
      reactions: [],
      poll: null,
    }));
  });
});
