import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface DmUser {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  status: string;
}

export interface DmChannelDto {
  id: string;
  type: 'DM' | 'GROUP_DM';
  recipients: DmUser[];
  lastMessageAt: string | null;
}

@Injectable()
export class DmsService {
  constructor(private readonly prisma: PrismaService) {}

  private toUserDTO(user: any): DmUser {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      status: user.status,
    };
  }

  async openDm(userId: string, otherUserId: string): Promise<DmChannelDto> {
    if (userId === otherUserId) {
      throw new ForbiddenException('Cannot open a DM with yourself');
    }

    const friendship = await this.prisma.friendship.findFirst({
      where: {
        status: 'ACCEPTED',
        OR: [
          { requesterId: userId, addresseeId: otherUserId },
          { requesterId: otherUserId, addresseeId: userId },
        ],
      },
    });
    if (!friendship) {
      throw new ForbiddenException('You must be friends to open a DM');
    }

    // Find an existing 1:1 DM containing both users.
    const candidates = await this.prisma.channel.findMany({
      where: {
        type: 'DM',
        AND: [
          { recipients: { some: { userId } } },
          { recipients: { some: { userId: otherUserId } } },
        ],
      },
      include: { recipients: { include: { user: true } } },
    });
    const existing = candidates.find((c) => c.recipients.length === 2);
    if (existing) {
      return {
        id: existing.id,
        type: 'DM',
        recipients: existing.recipients.map((r) => this.toUserDTO(r.user)),
        lastMessageAt: null,
      };
    }

    const channel = await this.prisma.channel.create({
      data: {
        type: 'DM',
        serverId: null,
        name: '',
        position: 0,
        recipients: { create: [{ userId }, { userId: otherUserId }] },
      },
      include: { recipients: { include: { user: true } } },
    });

    return {
      id: channel.id,
      type: 'DM',
      recipients: channel.recipients.map((r) => this.toUserDTO(r.user)),
      lastMessageAt: null,
    };
  }

  async listDms(userId: string): Promise<DmChannelDto[]> {
    const channels = await this.prisma.channel.findMany({
      where: {
        type: { in: ['DM', 'GROUP_DM'] },
        recipients: { some: { userId } },
      },
      include: {
        recipients: { include: { user: true } },
        // Newest non-deleted message drives "recent activity" sorting.
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true },
        },
      },
    });

    const dtos: DmChannelDto[] = channels.map((channel) => ({
      id: channel.id,
      type: channel.type as 'DM' | 'GROUP_DM',
      recipients: channel.recipients.map((r) => this.toUserDTO(r.user)),
      lastMessageAt: channel.messages[0]?.createdAt.toISOString() ?? null,
    }));

    // Most recent activity first; DMs with no messages fall to the bottom.
    dtos.sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''));
    return dtos;
  }
}
