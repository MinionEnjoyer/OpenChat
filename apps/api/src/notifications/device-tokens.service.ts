import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** @satisfies FR-NOTIF-001 */
export interface RegisterDeviceInput {
  token: string;
  platform: 'android' | 'ios';
}

/**
 * Device token registry — FR-NOTIF-001.
 *
 * Stores push notification device tokens per user.  A token moves if a
 * different user registers it (device changed hands / login switch).
 *
 * @satisfies FR-NOTIF-001
 */
@Injectable()
export class DeviceTokensService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotent upsert: same user + same token → update `lastSeen`.
   * Different user + existing token → transfer ownership (move to new user).
   * Brand-new token → create.
   */
  async register(userId: string, token: string, platform: 'android' | 'ios') {
    const existing = await this.prisma.deviceToken.findFirst({
      where: { token },
    });

    if (existing) {
      return this.prisma.deviceToken.update({
        where: { id: existing.id },
        data: { userId, platform, lastSeen: new Date() },
      });
    }

    return this.prisma.deviceToken.create({
      data: { userId, token, platform },
    });
  }

  /** List device tokens belonging to the given user only. */
  async listForUser(userId: string) {
    return this.prisma.deviceToken.findMany({
      where: { userId },
      orderBy: { lastSeen: 'desc' },
    });
  }

  /**
   * Delete a token.  Idempotent — deleting an unknown token is not an error;
   * returns `true` when a row was actually removed, `false` otherwise.
   */
  async delete(userId: string, token: string): Promise<boolean> {
    const existing = await this.prisma.deviceToken.findFirst({
      where: { token, userId },
    });
    if (!existing) return false;
    await this.prisma.deviceToken.delete({ where: { id: existing.id } });
    return true;
  }
}
