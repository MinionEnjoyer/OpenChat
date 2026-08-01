import { ChannelType, Prisma } from '@prisma/client';

export const MEMBER_JOINED_CONTENT = 'system::member_joined';
export const MEMBER_LEFT_CONTENT = 'system::member_left';

type MemberActivity = 'joined' | 'left';
type MemberActivityDb = Pick<Prisma.TransactionClient, 'channel' | 'message'>;

const MEMBER_ACTIVITY_INCLUDE = {
  author: true,
  attachments: true,
  reactions: true,
  replyTo: { include: { author: true } },
  poll: { include: { options: { include: { votes: true }, orderBy: { position: 'asc' as const } } } },
} as const;

/** Persist member activity in the server's first chat-capable channel. */
export async function createMemberActivityMessage(
  db: MemberActivityDb,
  serverId: string,
  userId: string,
  activity: MemberActivity,
) {
  const channel = await db.channel.findFirst({
    where: {
      serverId,
      type: { in: [ChannelType.TEXT, ChannelType.ANNOUNCEMENT] },
    },
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
    select: { id: true },
  });
  if (!channel) return null;

  return db.message.create({
    data: {
      channelId: channel.id,
      authorId: userId,
      content: activity === 'joined' ? MEMBER_JOINED_CONTENT : MEMBER_LEFT_CONTENT,
    },
    include: MEMBER_ACTIVITY_INCLUDE,
  });
}

/** Serialize the relation-complete Prisma record onto the existing message wire shape. */
export function serializeMemberActivityMessage(message: any) {
  return {
    id: message.id,
    channelId: message.channelId,
    authorId: message.authorId,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
    editedAt: null,
    deletedAt: null,
    replyToId: null,
    pinned: false,
    author: {
      id: message.author.id,
      username: message.author.username,
      displayName: message.author.displayName,
      avatarUrl: message.author.avatarUrl,
      status: message.author.status,
      isBot: message.author.isBot,
    },
    attachments: [],
    reactions: [],
    replyTo: null,
    poll: null,
  };
}
