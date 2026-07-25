import { Injectable } from '@nestjs/common';
import { FriendsService } from '../friends/friends.service';
import { ServersService } from '../servers/servers.service';
import { PrismaService } from '../prisma/prisma.service';
import type { NotificationLevel, NotificationScope } from '@prisma/client';

export interface UpsertNotificationSettingInput {
  scope: NotificationScope;
  scopeId: string;
  level: NotificationLevel;
  mutedUntil?: string | null;
}

/**
 * @satisfies FR-NOTIF-003
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly friends: FriendsService,
    private readonly servers: ServersService,
    private readonly prisma: PrismaService,
  ) {}

  /** Aggregate everything the user needs to act on: friend requests + server invitations. */
  async getForUser(userId: string) {
    const [pending, serverInvites] = await Promise.all([
      this.friends.listPending(userId),
      this.servers.listIncomingInvitations(userId),
    ]);
    const friendRequests = pending.incoming;
    return {
      friendRequests,
      serverInvites,
      count: friendRequests.length + serverInvites.length,
    };
  }

  /** List all notification settings for the authenticated user. */
  async getSettings(userId: string) {
    return this.prisma.notificationSetting.findMany({
      where: { userId },
      orderBy: { scope: 'asc' },
    });
  }

  /** Upsert a notification setting (scope + scopeId uniquely identify a setting). */
  async upsertSetting(userId: string, input: UpsertNotificationSettingInput) {
    const { scope, scopeId, level, mutedUntil } = input;
    return this.prisma.notificationSetting.upsert({
      where: {
        userId_scope_scopeId: { userId, scope, scopeId },
      },
      create: {
        userId,
        scope,
        scopeId,
        level,
        mutedUntil: mutedUntil ? new Date(mutedUntil) : null,
      },
      update: {
        level,
        mutedUntil: mutedUntil ? new Date(mutedUntil) : null,
      },
    });
  }

  /** Delete a notification setting by ID. */
  async deleteSetting(userId: string, settingId: string) {
    const existing = await this.prisma.notificationSetting.findFirst({
      where: { id: settingId, userId },
    });
    if (!existing) return null;
    await this.prisma.notificationSetting.delete({
      where: { id: settingId },
    });
    return { success: true };
  }
}
