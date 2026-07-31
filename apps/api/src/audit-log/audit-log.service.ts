import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Permission, hasPermission } from '../permissions/permissions';
import type { Prisma } from '@prisma/client';

export type AuditAction =
  | 'KICK'
  | 'ROLE_CREATE'
  | 'ROLE_UPDATE'
  | 'ROLE_DELETE'
  | 'ROLE_ASSIGN'
  | 'ROLE_UNASSIGN'
  | 'CHANNEL_CREATE'
  | 'CHANNEL_DELETE'
  | 'SERVER_UPDATE'
  | 'MEMBER_JOIN'
  | 'MEMBER_LEAVE'
  | 'MESSAGE_DELETE'
  | 'MESSAGE_PIN'
  | 'MESSAGE_UNPIN';

export interface AuditLogEntry {
  id: string;
  serverId: string;
  actor: { id: string; username: string; displayName: string | null; avatarUrl: string | null };
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: any;
  createdAt: string;
}

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Write a single audit log entry. Call this within a transaction when possible.
   * Returns the created entry.
   */
  async write(params: {
    serverId: string;
    actorId: string;
    action: AuditAction;
    targetType?: string;
    targetId?: string;
    metadata?: any;
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        serverId: params.serverId,
        actorId: params.actorId,
        action: params.action,
        targetType: params.targetType ?? null,
        targetId: params.targetId ?? null,
        metadata: params.metadata ?? undefined,
      },
    });
  }

  /**
   * Read the audit log for a server, permission-gated.
   * Requires MANAGE_SERVER permission.
   */
  async read(
    serverId: string,
    userId: string,
    options?: { before?: string; limit?: number; action?: string; actorId?: string },
  ): Promise<{ entries: AuditLogEntry[] }> {
    // Membership and permission check
    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
      select: { ownerId: true },
    });
    if (!server) throw new NotFoundException('Server not found');

    const member = await this.prisma.serverMember.findUnique({
      where: { serverId_userId: { serverId, userId } },
      include: { roles: true },
    });
    if (!member) throw new ForbiddenException('You are not a member of this server');

    // Owners bypass role resolution. Other members only need the roles already loaded above;
    // querying every role in the server for an owner was both redundant and incorrect work.
    const memberPermissions = member.roles.reduce((acc, role) => acc | role.permissions, 0n);
    if (server.ownerId !== userId && !hasPermission(memberPermissions, Permission.MANAGE_SERVER)) {
      throw new ForbiddenException('You do not have permission to view the audit log');
    }

    const limit = Math.min(options?.limit ?? 50, 100);
    const where: Prisma.AuditLogWhereInput = { serverId };

    if (options?.action) where.action = options.action;
    if (options?.actorId) where.actorId = options.actorId;

    if (options?.before) {
      const cursor = await this.prisma.auditLog.findUnique({
        where: { id: options.before },
        select: { createdAt: true },
      });
      if (cursor) where.createdAt = { lt: cursor.createdAt };
    }

    const logs = await this.prisma.auditLog.findMany({
      where,
      include: { actor: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return {
      entries: logs.map((l) => ({
        id: l.id,
        serverId: l.serverId,
        actor: {
          id: l.actor.id,
          username: l.actor.username,
          displayName: l.actor.displayName,
          avatarUrl: l.actor.avatarUrl,
        },
        action: l.action,
        targetType: l.targetType,
        targetId: l.targetId,
        metadata: l.metadata,
        createdAt: l.createdAt.toISOString(),
      })),
    };
  }
}
