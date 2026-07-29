import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { ServersService } from '../servers/servers.service';
import { Permission, hasPermission } from '../permissions/permissions';

/** Public-ish shape for a bot account (never exposes authSub or the token). */
const BOT_SELECT = {
  id: true, username: true, displayName: true, avatarUrl: true,
  botDescription: true, botPublished: true, botOwnerId: true, isBot: true, createdAt: true,
} as const;

/**
 * Bot accounts (Discord-style). A bot is a User with isBot=true, owned by whoever created it,
 * authenticating with an ApiToken. Owners can publish a bot to the add-bot browser; anyone with
 * Manage Server can then add a published (or owned) bot to their server as a member.
 */
@Injectable()
export class BotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly servers: ServersService,
  ) {}

  /** Create a bot owned by the caller; returns the bot + its token (shown once). */
  async createBot(ownerId: string, input: { username?: string; displayName?: string; description?: string }) {
    const username = (input.username || '').trim();
    if (!/^[a-zA-Z0-9_.-]{2,32}$/.test(username)) {
      throw new BadRequestException('Bot username must be 2–32 chars: letters, numbers, and . _ -');
    }
    const bot = await this.prisma.user.create({
      data: {
        authSub: `bot:${randomUUID()}`,
        username,
        displayName: (input.displayName || username).slice(0, 80),
        isBot: true,
        botOwnerId: ownerId,
        botDescription: input.description ? input.description.slice(0, 300) : null,
        status: 'OFFLINE',
      },
      select: BOT_SELECT,
    });
    const { token } = await this.auth.createToken(bot.id, 'Bot token');
    return { bot, token };
  }

  listMine(ownerId: string) {
    return this.prisma.user.findMany({
      where: { isBot: true, botOwnerId: ownerId }, select: BOT_SELECT, orderBy: { createdAt: 'desc' },
    });
  }

  /** Published bots — powers the add-bot browser. */
  listDirectory() {
    return this.prisma.user.findMany({
      where: { isBot: true, botPublished: true }, select: BOT_SELECT, orderBy: { createdAt: 'desc' },
    });
  }

  private async ownedBotOrThrow(ownerId: string, botId: string) {
    const bot = await this.prisma.user.findFirst({ where: { id: botId, isBot: true, botOwnerId: ownerId } });
    if (!bot) throw new NotFoundException('Bot not found');
    return bot;
  }

  async updateBot(ownerId: string, botId: string, input: { displayName?: string; description?: string; published?: boolean; avatarUrl?: string }) {
    await this.ownedBotOrThrow(ownerId, botId);
    return this.prisma.user.update({
      where: { id: botId },
      data: {
        ...(input.displayName !== undefined ? { displayName: input.displayName.slice(0, 80) || null } : {}),
        ...(input.description !== undefined ? { botDescription: input.description ? input.description.slice(0, 300) : null } : {}),
        ...(input.published !== undefined ? { botPublished: !!input.published } : {}),
        ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl ? input.avatarUrl.slice(0, 1000) : null } : {}),
      },
      select: BOT_SELECT,
    });
  }

  /** Revoke the bot's existing tokens and mint a fresh one (shown once). */
  async resetToken(ownerId: string, botId: string) {
    await this.ownedBotOrThrow(ownerId, botId);
    await this.prisma.apiToken.updateMany({ where: { userId: botId, revokedAt: null }, data: { revokedAt: new Date() } });
    const { token } = await this.auth.createToken(botId, 'Bot token');
    return { token };
  }

  async deleteBot(ownerId: string, botId: string) {
    await this.ownedBotOrThrow(ownerId, botId);
    await this.prisma.user.delete({ where: { id: botId } });
    return { success: true as const };
  }

  /** Add a bot to a server as a member (caller needs Manage Server). Idempotent. */
  async addToServer(callerId: string, serverId: string, botId: string) {
    const perms = await this.servers.getMemberPermissions(serverId, callerId);
    if (!hasPermission(perms, Permission.MANAGE_SERVER)) {
      throw new ForbiddenException('You need Manage Server to add a bot');
    }
    const bot = await this.prisma.user.findFirst({ where: { id: botId, isBot: true } });
    if (!bot) throw new NotFoundException('Bot not found');
    await this.prisma.serverMember.upsert({
      where: { serverId_userId: { serverId, userId: botId } },
      create: { serverId, userId: botId },
      update: {},
    });
    // A fresh member has no roles → no perms on servers without a permissive @everyone, so the
    // bot couldn't even read/send. Give it a shared "Bots" role granting basic chat access.
    const chatPerms = Permission.SEND_MESSAGES | Permission.READ_MESSAGES;
    let role = await this.prisma.role.findFirst({ where: { serverId, name: 'Bots' } });
    if (!role) {
      const mx = await this.prisma.role.aggregate({ where: { serverId }, _max: { position: true } });
      role = await this.prisma.role.create({ data: { serverId, name: 'Bots', permissions: chatPerms, position: (mx._max.position ?? 0) + 1 } });
    }
    await this.prisma.serverMember.update({
      where: { serverId_userId: { serverId, userId: botId } },
      data: { roles: { connect: { id: role.id } } },
    });
    return { success: true as const };
  }

  async removeFromServer(callerId: string, serverId: string, botId: string) {
    const perms = await this.servers.getMemberPermissions(serverId, callerId);
    if (!hasPermission(perms, Permission.MANAGE_SERVER)) {
      throw new ForbiddenException('You need Manage Server to remove a bot');
    }
    await this.prisma.serverMember.deleteMany({ where: { serverId, userId: botId } });
    return { success: true as const };
  }
}
