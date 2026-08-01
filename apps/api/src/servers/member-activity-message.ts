import { MessageKind, type Prisma } from '@prisma/client';

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
    where: { serverId, isDefault: true },
    select: { id: true },
  });
  if (!channel) return null;

  return db.message.create({
    data: {
      channelId: channel.id,
      authorId: userId,
      content: '',
      kind: activity === 'joined' ? MessageKind.MEMBER_JOINED : MessageKind.MEMBER_LEFT,
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
    kind: message.kind,
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
