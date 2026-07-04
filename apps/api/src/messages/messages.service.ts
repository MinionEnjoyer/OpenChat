import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { Permission, hasPermission, ALL_PERMISSIONS } from '../permissions/permissions';
import { z } from 'zod';

const CreateMessageSchema = z.object({
  content: z.string(),
  attachments: z.array(
    z.object({
      shareAssetId: z.string(),
      filename: z.string(),
      mimeType: z.string(),
      size: z.coerce.bigint(),
      url: z.string(),
      thumbnailUrl: z.string().nullable().optional(),
      width: z.number().int().nullable().optional(),
      height: z.number().int().nullable().optional(),
      durationMs: z.number().int().nullable().optional(),
    })
  ).default([]),
  replyToId: z.string().uuid().nullable().optional(),
});

const EditMessageSchema = z.object({
  content: z.string(),
});

const CreatePollSchema = z.object({
  question: z.string().trim().min(1).max(300),
  options: z.array(z.string().trim().min(1).max(100)).min(2).max(10),
  multiple: z.boolean().default(false),
  durationMinutes: z.number().int().positive().max(10080).nullable().optional(),
});

export interface MessageWithRelations {
  id: string;
  channelId: string;
  authorId: string;
  content: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  replyToId: string | null;
  pinned: boolean;
  author: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    status: string;
  };
  attachments: Array<{
    id: string;
    messageId: string;
    shareAssetId: string;
    filename: string;
    mimeType: string;
    size: string;
    url: string;
    thumbnailUrl: string | null;
    width: number | null;
    height: number | null;
    durationMs: number | null;
  }>;
  reactions: Array<{ emoji: string; count: number; userIds: string[] }>;
  replyTo: { id: string; authorName: string; content: string } | null;
  poll: {
    id: string;
    question: string;
    multiple: boolean;
    closesAt: string | null;
    options: Array<{ id: string; text: string; voterIds: string[] }>;
  } | null;
}

/** Relations to load whenever a message is serialized (kept in one place). */
const MESSAGE_INCLUDE = {
  author: true,
  attachments: true,
  reactions: true,
  replyTo: { include: { author: true } },
  poll: { include: { options: { include: { votes: true }, orderBy: { position: 'asc' as const } } } },
} as const;

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Assert the user may access a channel: a ServerMember for server channels,
   * or a ChannelRecipient for DM channels (serverId = null). Throws otherwise.
   */
  private async assertChannelAccess(channelId: string, userId: string): Promise<void> {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { serverId: true },
    });
    if (!channel) throw new NotFoundException('Channel not found');

    if (channel.serverId) {
      const member = await this.prisma.serverMember.findUnique({
        where: { serverId_userId: { serverId: channel.serverId, userId } },
      });
      if (!member) throw new ForbiddenException('Not a member of this server');
    } else {
      const recipient = await this.prisma.channelRecipient.findUnique({
        where: { channelId_userId: { channelId, userId } },
      });
      if (!recipient) throw new ForbiddenException('Not a participant of this DM');
    }
  }

  async list(channelId: string, userId: string, options?: { before?: string; limit?: number }): Promise<MessageWithRelations[]> {
    await this.assertChannelAccess(channelId, userId);

    const limit = options?.limit ?? 50;
    const whereClause: any = { channelId, deletedAt: null };

    // Cursor pagination by the createdAt of the `before` message id.
    if (options?.before) {
      const cursor = await this.prisma.message.findUnique({
        where: { id: options.before },
        select: { createdAt: true },
      });
      if (cursor) whereClause.createdAt = { lt: cursor.createdAt };
    }

    const messages = await this.prisma.message.findMany({
      where: whereClause,
      include: MESSAGE_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: limit + 1, // Fetch one extra to determine if there are more (optional optimization)
    });

    return messages.map((msg) => this.serializeMessage(msg));
  }

  async create(channelId: string, userId: string, data: { content: string; attachments?: any[]; nonce?: string; replyToId?: string | null }) {
    const validated = CreateMessageSchema.parse(data);

    await this.assertChannelAccess(channelId, userId);

    // If replying, make sure the referenced message is in the same channel.
    if (validated.replyToId) {
      const parent = await this.prisma.message.findUnique({
        where: { id: validated.replyToId },
        select: { channelId: true },
      });
      if (!parent || parent.channelId !== channelId) validated.replyToId = null;
    }

    // Create message and attachments in a transaction
    const message = await this.prisma.$transaction(async (tx) => {
      const createdMessage = await tx.message.create({
        data: {
          channelId,
          authorId: userId,
          content: validated.content,
          replyToId: validated.replyToId ?? null,
          attachments: {
            createMany: {
              data: validated.attachments.map((att) => ({
                shareAssetId: att.shareAssetId,
                filename: att.filename,
                mimeType: att.mimeType,
                size: att.size,
                url: att.url,
                thumbnailUrl: att.thumbnailUrl ?? null,
                width: att.width ?? null,
                height: att.height ?? null,
                durationMs: att.durationMs ?? null,
              })),
            },
          },
        },
        include: MESSAGE_INCLUDE,
      });

      return createdMessage;
    });

    // Publish serialized event to Redis for cross-instance fan-out
    const dto = this.serializeMessage(message);
    await this.redis.publish('chat:events', { type: 'MESSAGE_CREATED', message: dto });

    this.dispatchMentions(channelId, validated.content, userId, message.id).catch(() => {});

    return dto;
  }

  /** Create a poll as a message in the channel. */
  async createPoll(channelId: string, userId: string, data: unknown) {
    const v = CreatePollSchema.parse(data);
    await this.assertChannelAccess(channelId, userId);
    const closesAt = v.durationMinutes ? new Date(Date.now() + v.durationMinutes * 60_000) : null;

    const message = await this.prisma.message.create({
      data: {
        channelId,
        authorId: userId,
        content: v.question,
        poll: {
          create: {
            question: v.question,
            multiple: v.multiple,
            closesAt,
            options: { create: v.options.map((text, i) => ({ text, position: i })) },
          },
        },
      },
      include: MESSAGE_INCLUDE,
    });

    const dto = this.serializeMessage(message);
    await this.redis.publish('chat:events', { type: 'MESSAGE_CREATED', message: dto });
    return dto;
  }

  /** Toggle the current user's vote on a poll option; single-choice polls clear prior votes. */
  async votePollOption(optionId: string, userId: string) {
    const option = await this.prisma.pollOption.findUnique({
      where: { id: optionId },
      include: {
        poll: {
          include: {
            message: { select: { id: true, channelId: true } },
            options: { select: { id: true } },
          },
        },
      },
    });
    if (!option) throw new NotFoundException('Poll option not found');
    const poll = option.poll;
    await this.assertChannelAccess(poll.message.channelId, userId);
    if (poll.closesAt && poll.closesAt.getTime() < Date.now()) {
      throw new ForbiddenException('This poll is closed');
    }

    const existing = await this.prisma.pollVote.findUnique({
      where: { optionId_userId: { optionId, userId } },
    });
    if (existing) {
      await this.prisma.pollVote.delete({ where: { id: existing.id } });
    } else {
      if (!poll.multiple) {
        await this.prisma.pollVote.deleteMany({
          where: { userId, optionId: { in: poll.options.map((o) => o.id) } },
        });
      }
      await this.prisma.pollVote.create({ data: { optionId, userId } });
    }
    return this.publishMessageUpdate(poll.message.id);
  }

  /** Parse @user / @everyone / @here from content and ping the mentioned members. */
  private async dispatchMentions(channelId: string, content: string, authorId: string, messageId: string) {
    const hasEveryone = /(^|\s)@everyone\b/.test(content);
    const hasHere = /(^|\s)@here\b/.test(content);
    const userMentions = [...content.matchAll(/(?:^|\s)@([\w.-]+)/g)]
      .map((m) => m[1].toLowerCase())
      .filter((u) => u !== 'everyone' && u !== 'here');
    if (!hasEveryone && !hasHere && userMentions.length === 0) return;

    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { serverId: true, name: true },
    });
    if (!channel) return;

    const targets = new Set<string>();
    let authorName = 'Someone';

    if (channel.serverId) {
      const members = await this.prisma.serverMember.findMany({
        where: { serverId: channel.serverId },
        include: { user: true, roles: true },
      });
      const author = members.find((m) => m.userId === authorId);
      authorName = author?.user.displayName || author?.user.username || 'Someone';

      if (hasEveryone || hasHere) {
        const server = await this.prisma.server.findUnique({ where: { id: channel.serverId }, select: { ownerId: true } });
        const perms = server?.ownerId === authorId
          ? ALL_PERMISSIONS
          : (author?.roles.reduce((a, r) => a | r.permissions, 0n) ?? 0n);
        if (hasPermission(perms, Permission.MENTION_EVERYONE)) {
          for (const m of members) {
            if (hasEveryone) targets.add(m.userId);
            else if (hasHere && ['ONLINE', 'AWAY', 'DND'].includes(m.user.status)) targets.add(m.userId);
          }
        }
      }
      for (const u of userMentions) {
        const m = members.find((mm) => mm.user.username.toLowerCase() === u);
        if (m) targets.add(m.userId);
      }
    } else {
      const recips = await this.prisma.channelRecipient.findMany({ where: { channelId }, include: { user: true } });
      const author = recips.find((r) => r.userId === authorId);
      authorName = author?.user.displayName || author?.user.username || 'Someone';
      for (const u of userMentions) {
        const r = recips.find((rr) => rr.user.username.toLowerCase() === u);
        if (r) targets.add(r.userId);
      }
    }

    targets.delete(authorId);
    const preview = content.replace(/\s+/g, ' ').slice(0, 80);
    for (const uid of targets) {
      await this.redis.publish('chat:events', {
        type: 'MENTION', userId: uid, channelId, messageId, channelName: channel.name, authorName, preview,
      });
    }
  }

  async edit(messageId: string, userId: string, data: { content: string }) {
    const validated = EditMessageSchema.parse(data);

    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    // Author-only edit
    if (message.authorId !== userId) {
      throw new ForbiddenException('Only the author can edit this message');
    }

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: {
        content: validated.content,
        editedAt: new Date(),
      },
      include: MESSAGE_INCLUDE,
    });

    const dto = this.serializeMessage(updated);
    await this.redis.publish('chat:events', { type: 'MESSAGE_UPDATED', message: dto });

    return dto;
  }

  async remove(messageId: string, userId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { channel: true },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    // A message may be deleted by its author, or — in a server channel — by anyone with the
    // MANAGE_MESSAGES permission (the server owner always qualifies). DM messages: author only.
    const isAuthor = message.authorId === userId;
    let allowed = isAuthor;

    if (!allowed && message.channel?.serverId) {
      const serverId = message.channel.serverId;
      const server = await this.prisma.server.findUnique({
        where: { id: serverId },
        select: { ownerId: true },
      });
      if (server?.ownerId === userId) {
        allowed = true;
      } else {
        const member = await this.prisma.serverMember.findUnique({
          where: { serverId_userId: { serverId, userId } },
          include: { roles: true },
        });
        if (member) {
          const perms = member.roles.reduce((acc, r) => acc | r.permissions, 0n);
          if (hasPermission(perms, Permission.MANAGE_MESSAGES)) allowed = true;
        }
      }
    }

    if (!allowed) {
      throw new ForbiddenException('Insufficient permissions to delete this message');
    }

    const deleted = await this.prisma.message.update({
      where: { id: messageId },
      data: {
        deletedAt: new Date(),
      },
      select: {
        id: true,
        channelId: true,
      },
    });

    await this.redis.publish('chat:events', {
      type: 'MESSAGE_DELETED',
      id: deleted.id,
      channelId: deleted.channelId,
    });

    return deleted;
  }

  /**
   * Pin or unpin a message. In a server channel this requires MANAGE_MESSAGES
   * (the owner always qualifies); in a DM any participant may pin.
   */
  async setPinned(messageId: string, userId: string, pinned: boolean) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { channel: true },
    });
    if (!message || message.deletedAt) throw new NotFoundException('Message not found');

    await this.assertChannelAccess(message.channelId, userId);

    if (message.channel?.serverId) {
      const serverId = message.channel.serverId;
      const server = await this.prisma.server.findUnique({ where: { id: serverId }, select: { ownerId: true } });
      let allowed = server?.ownerId === userId;
      if (!allowed) {
        const member = await this.prisma.serverMember.findUnique({
          where: { serverId_userId: { serverId, userId } },
          include: { roles: true },
        });
        const perms = member ? member.roles.reduce((acc, r) => acc | r.permissions, 0n) : 0n;
        allowed = hasPermission(perms, Permission.MANAGE_MESSAGES);
      }
      if (!allowed) throw new ForbiddenException('Insufficient permissions to pin messages');
    }

    await this.prisma.message.update({ where: { id: messageId }, data: { pinned } });
    return this.publishMessageUpdate(messageId);
  }

  /** List a channel's pinned messages, newest first. */
  async listPinned(channelId: string, userId: string): Promise<MessageWithRelations[]> {
    await this.assertChannelAccess(channelId, userId);
    const messages = await this.prisma.message.findMany({
      where: { channelId, pinned: true, deletedAt: null },
      include: MESSAGE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return messages.map((m) => this.serializeMessage(m));
  }

  async markRead(channelId: string, userId: string, lastReadMessageId: string) {
    // Update or create ReadState
    await this.prisma.readState.upsert({
      where: {
        userId_channelId: {
          userId,
          channelId,
        },
      },
      update: {
        lastReadMessageId,
        mentionCount: 0, // Reset mentions on read? Usually yes.
      },
      create: {
        userId,
        channelId,
        lastReadMessageId,
        mentionCount: 0,
      },
    });

    // Note: Presence/Typing events are handled via WS, but ReadState is DB only unless we want to broadcast read receipts.
    // The contract doesn't explicitly ask for a 'read.updated' event, so we skip publishing.
    
    return { success: true };
  }

  async addReaction(messageId: string, userId: string, emoji: string) {
    const message = await this.prisma.message.findUnique({ where: { id: messageId }, select: { channelId: true } });
    if (!message) throw new NotFoundException('Message not found');
    await this.assertChannelAccess(message.channelId, userId);
    await this.prisma.reaction.upsert({
      where: { messageId_userId_emoji: { messageId, userId, emoji } },
      create: { messageId, userId, emoji },
      update: {},
    });
    return this.publishMessageUpdate(messageId);
  }

  async removeReaction(messageId: string, userId: string, emoji: string) {
    const message = await this.prisma.message.findUnique({ where: { id: messageId }, select: { channelId: true } });
    if (!message) throw new NotFoundException('Message not found');
    await this.assertChannelAccess(message.channelId, userId);
    await this.prisma.reaction.deleteMany({ where: { messageId, userId, emoji } });
    return this.publishMessageUpdate(messageId);
  }

  /** Re-serialize a message and broadcast it as an update (used after reaction changes). */
  private async publishMessageUpdate(messageId: string): Promise<MessageWithRelations> {
    const fresh = await this.prisma.message.findUniqueOrThrow({
      where: { id: messageId },
      include: MESSAGE_INCLUDE,
    });
    const dto = this.serializeMessage(fresh);
    await this.redis.publish('chat:events', { type: 'MESSAGE_UPDATED', message: dto });
    return dto;
  }

  private serializeMessage(msg: any): MessageWithRelations {
    return {
      id: msg.id,
      channelId: msg.channelId,
      authorId: msg.authorId,
      content: msg.content,
      createdAt: msg.createdAt.toISOString(),
      editedAt: msg.editedAt ? msg.editedAt.toISOString() : null,
      deletedAt: msg.deletedAt ? msg.deletedAt.toISOString() : null,
      replyToId: msg.replyToId,
      pinned: msg.pinned,
      author: {
        id: msg.author.id,
        username: msg.author.username,
        displayName: msg.author.displayName,
        avatarUrl: msg.author.avatarUrl,
        status: msg.author.status,
      },
      attachments: msg.attachments.map((att: any) => ({
        id: att.id,
        messageId: att.messageId,
        shareAssetId: att.shareAssetId,
        filename: att.filename,
        mimeType: att.mimeType,
        size: att.size.toString(), // BigInt to string as per convention
        url: att.url,
        thumbnailUrl: att.thumbnailUrl,
        width: att.width,
        height: att.height,
        durationMs: att.durationMs,
      })),
      reactions: this.groupReactions(msg.reactions ?? []),
      replyTo: msg.replyTo
        ? {
            id: msg.replyTo.id,
            authorName: msg.replyTo.author?.displayName || msg.replyTo.author?.username || 'user',
            content: (msg.replyTo.content || '').slice(0, 120),
          }
        : null,
      poll: msg.poll
        ? {
            id: msg.poll.id,
            question: msg.poll.question,
            multiple: msg.poll.multiple,
            closesAt: msg.poll.closesAt ? msg.poll.closesAt.toISOString() : null,
            options: (msg.poll.options ?? []).map((o: any) => ({
              id: o.id,
              text: o.text,
              voterIds: (o.votes ?? []).map((v: any) => v.userId),
            })),
          }
        : null,
    };
  }

  private groupReactions(reactions: Array<{ emoji: string; userId: string }>) {
    const map = new Map<string, string[]>();
    for (const r of reactions) {
      const arr = map.get(r.emoji) ?? [];
      arr.push(r.userId);
      map.set(r.emoji, arr);
    }
    return [...map.entries()].map(([emoji, userIds]) => ({ emoji, count: userIds.length, userIds }));
  }
}
