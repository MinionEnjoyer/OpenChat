import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import type { User } from '@prisma/client';

@Injectable()
export class FriendsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  private notify(userId: string) {
    this.redis.publish('chat:events', { type: 'NOTIFY', userId }).catch(() => {});
  }

  private toUserDTO(user: User): Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl' | 'status'> {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName ?? null,
      avatarUrl: user.avatarUrl ?? null,
      status: user.status,
    };
  }

  async sendRequest(
    userId: string,
    opts: { username?: string; friendCode?: string },
  ): Promise<any> {
    const target = opts.friendCode
      ? await this.prisma.user.findUnique({ where: { friendCode: opts.friendCode.trim() } })
      : await this.prisma.user.findFirst({
          where: { username: { equals: (opts.username ?? '').trim(), mode: 'insensitive' } },
        });

    if (!target) {
      throw new NotFoundException(opts.friendCode ? 'No user with that friend code' : 'User not found');
    }

    if (userId === target.id) {
      throw new BadRequestException('Cannot send friend request to yourself');
    }

    // Check for existing reverse PENDING request
    const reverseRequest = await this.prisma.friendship.findFirst({
      where: {
        requesterId: target.id,
        addresseeId: userId,
        status: 'PENDING',
      },
    });

    if (reverseRequest) {
      // Accept the reverse request automatically
      const updated = await this.prisma.friendship.update({
        where: { id: reverseRequest.id },
        data: { status: 'ACCEPTED' },
      });
      this.notify(target.id);
      return this.toUserDTO(target);
    }

    // Upsert friendship (create or ignore if already exists)
    const existing = await this.prisma.friendship.findUnique({
      where: {
        requesterId_addresseeId: {
          requesterId: userId,
          addresseeId: target.id,
        },
      },
    });

    if (existing && existing.status !== 'BLOCKED') {
      throw new BadRequestException('Friend request already sent or accepted');
    }

    const friendship = await this.prisma.friendship.upsert({
      where: {
        requesterId_addresseeId: {
          requesterId: userId,
          addresseeId: target.id,
        },
      },
      create: {
        requesterId: userId,
        addresseeId: target.id,
        status: 'PENDING',
      },
      update: {},
    });

    this.notify(target.id);
    return this.toUserDTO(target);
  }

  async listFriends(userId: string): Promise<any[]> {
    const friendships = await this.prisma.friendship.findMany({
      where: {
        OR: [
          { requesterId: userId, status: 'ACCEPTED' },
          { addresseeId: userId, status: 'ACCEPTED' },
        ],
      },
    });

    const friends = friendships.map((f) => {
      const friendId = f.requesterId === userId ? f.addresseeId : f.requesterId;
      return this.prisma.user.findUnique({ where: { id: friendId } });
    });

    const users = await Promise.all(friends);
    return users.map((u) => (u ? this.toUserDTO(u) : null)).filter(Boolean);
  }

  async listPending(userId: string): Promise<{ incoming: any[]; outgoing: any[] }> {
    const incoming = await this.prisma.friendship.findMany({
      where: { addresseeId: userId, status: 'PENDING' },
      include: { requester: true },
    });

    const outgoing = await this.prisma.friendship.findMany({
      where: { requesterId: userId, status: 'PENDING' },
      include: { addressee: true },
    });

    return {
      incoming: incoming.map((f) => ({
        id: f.id,
        user: this.toUserDTO(f.requester),
      })),
      outgoing: outgoing.map((f) => ({
        id: f.id,
        user: this.toUserDTO(f.addressee),
      })),
    };
  }

  async accept(friendshipId: string, userId: string): Promise<void> {
    const friendship = await this.prisma.friendship.findUnique({
      where: { id: friendshipId },
    });

    if (!friendship) {
      throw new NotFoundException('Friend request not found');
    }

    if (friendship.addresseeId !== userId) {
      throw new BadRequestException('You are not the recipient of this friend request');
    }

    await this.prisma.friendship.update({
      where: { id: friendshipId },
      data: { status: 'ACCEPTED' },
    });
    // Let the original requester know their request was accepted (updates their friends list live).
    this.notify(friendship.requesterId);
  }

  async decline(friendshipId: string, userId: string): Promise<void> {
    const friendship = await this.prisma.friendship.findUnique({
      where: { id: friendshipId },
    });

    if (!friendship) {
      throw new NotFoundException('Friend request not found');
    }

    if (friendship.addresseeId !== userId) {
      throw new BadRequestException('You are not the recipient of this friend request');
    }

    await this.prisma.friendship.delete({
      where: { id: friendshipId },
    });
  }

  async remove(userId: string, otherUserId: string): Promise<void> {
    const friendship = await this.prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: userId, addresseeId: otherUserId, status: 'ACCEPTED' },
          { requesterId: otherUserId, addresseeId: userId, status: 'ACCEPTED' },
        ],
      },
    });

    if (!friendship) {
      throw new NotFoundException('Friendship not found');
    }

    await this.prisma.friendship.delete({
      where: { id: friendship.id },
    });
  }

  async block(userId: string, otherUserId: string): Promise<void> {
    await this.prisma.friendship.upsert({
      where: {
        requesterId_addresseeId: {
          requesterId: userId,
          addresseeId: otherUserId,
        },
      },
      create: {
        requesterId: userId,
        addresseeId: otherUserId,
        status: 'BLOCKED',
      },
      update: {
        status: 'BLOCKED',
      },
    });
  }
}
