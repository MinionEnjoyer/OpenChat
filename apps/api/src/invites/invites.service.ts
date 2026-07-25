import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { User } from '@prisma/client';

@Injectable()
export class InvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly auditLog: AuditLogService,
  ) {}

  async createInvite(
    serverId: string,
    userId: string,
    opts: { maxUses?: number; expiresInHours?: number },
  ) {
    const member = await this.prisma.serverMember.findFirst({
      where: { serverId, userId },
    });

    if (!member) {
      throw new NotFoundException('User is not a member of the specified server');
    }

    const code = this.generateCode();
    const expiresAt = opts.expiresInHours
      ? new Date(Date.now() + opts.expiresInHours * 60 * 60 * 1000)
      : null;

    const invite = await this.prisma.invite.create({
      data: {
        code,
        serverId,
        inviterId: userId,
        maxUses: opts.maxUses ?? null,
        expiresAt,
      },
    });

    return {
      code: invite.code,
      serverId: invite.serverId,
      expiresAt: invite.expiresAt?.toISOString() ?? null,
      maxUses: invite.maxUses,
    };
  }

  async getInvite(code: string) {
    const invite = await this.prisma.invite.findUnique({
      where: { code },
      include: {
        server: true,
        inviter: true,
      },
    });

    if (!invite) {
      throw new NotFoundException('Invite not found');
    }

    const now = new Date();
    if (invite.expiresAt && invite.expiresAt < now) {
      throw new BadRequestException('Invite has expired');
    }

    if (invite.maxUses !== null && invite.uses >= invite.maxUses) {
      throw new BadRequestException('Invite usage limit reached');
    }

    return {
      code: invite.code,
      server: {
        id: invite.server.id,
        name: invite.server.name,
        iconUrl: invite.server.iconUrl ?? null,
      },
      inviter: {
        id: invite.inviter.id,
        username: invite.inviter.username,
      },
      expiresAt: invite.expiresAt?.toISOString() ?? null,
    };
  }

  async acceptInvite(code: string, userId: string) {
    const invite = await this.prisma.invite.findUnique({
      where: { code },
      include: { server: true },
    });

    if (!invite) {
      throw new NotFoundException('Invite not found');
    }

    const now = new Date();
    if (invite.expiresAt && invite.expiresAt < now) {
      throw new BadRequestException('Invite has expired');
    }

    if (invite.maxUses !== null && invite.uses >= invite.maxUses) {
      throw new BadRequestException('Invite usage limit reached');
    }

    // P7: reject banned users
    const ban = await this.prisma.ban.findUnique({
      where: { serverId_userId: { serverId: invite.serverId, userId } },
    });
    if (ban) {
      throw new ForbiddenException('You are banned from this server');
    }

    const existingMember = await this.prisma.serverMember.findUnique({
      where: {
        serverId_userId: {
          serverId: invite.serverId,
          userId,
        },
      },
    });

    if (existingMember) {
      return {
        id: invite.server.id,
        name: invite.server.name,
        ownerId: invite.server.ownerId,
        iconUrl: invite.server.iconUrl ?? null,
        createdAt: invite.server.createdAt.toISOString(),
        updatedAt: invite.server.updatedAt.toISOString(),
      };
    }

    const server = await this.prisma.$transaction(async (tx) => {
      await tx.invite.update({
        where: { code },
        data: { uses: { increment: 1 } },
      });

      await tx.serverMember.create({
        data: {
          serverId: invite.serverId,
          userId,
        },
      });

      return tx.server.findUniqueOrThrow({
        where: { id: invite.serverId },
      });
    });

    await this.auditLog.write({
      serverId: invite.serverId,
      actorId: userId,
      action: 'MEMBER_JOIN',
      targetType: 'member',
      targetId: userId,
    });

    const memberRecord = await this.prisma.serverMember.findUnique({
      where: { serverId_userId: { serverId: invite.serverId, userId } },
      include: { user: true, roles: true },
    });
    const member = {
      userId,
      nickname: memberRecord?.nickname ?? null,
      joinedAt: memberRecord!.joinedAt.toISOString(),
      isOwner: server.ownerId === userId,
      roleIds: memberRecord!.roles.map((r: any) => r.id),
      user: {
        id: memberRecord!.user.id,
        username: memberRecord!.user.username,
        displayName: memberRecord!.user.displayName,
        avatarUrl: memberRecord!.user.avatarUrl,
        status: memberRecord!.user.status,
      },
    };
    this.redis.publish('chat:events', { type: 'MEMBER_JOINED', serverId: invite.serverId, userId, member }).catch(() => {});

    return {
      id: server.id,
      name: server.name,
      ownerId: server.ownerId,
      iconUrl: server.iconUrl ?? null,
      createdAt: server.createdAt.toISOString(),
      updatedAt: server.updatedAt.toISOString(),
    };
  }

  private generateCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}
