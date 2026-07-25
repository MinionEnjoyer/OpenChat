import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException, Inject, forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ServersService } from '../servers/servers.service';
import { Permission } from '../permissions/permissions';
import { OverwriteTargetType } from '@prisma/client';

export interface SerializedOverwrite {
  id: string;
  channelId: string;
  targetType: string;
  targetId: string;
  allow: string;
  deny: string;
}

@Injectable()
export class OverwritesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ServersService)) private readonly servers: ServersService,
  ) {}

  private serialize(ow: any): SerializedOverwrite {
    return {
      id: ow.id,
      channelId: ow.channelId,
      targetType: ow.targetType,
      targetId: ow.targetId,
      allow: ow.allow.toString(),
      deny: ow.deny.toString(),
    };
  }

  /** List all overwrites for a channel. */
  async list(serverId: string, channelId: string, userId: string): Promise<SerializedOverwrite[]> {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { serverId: true },
    });
    if (!channel || channel.serverId !== serverId) {
      throw new NotFoundException('Channel not found');
    }
    // Assert membership
    await this.servers.get(serverId, userId);

    const overwrites = await this.prisma.channelOverwrite.findMany({
      where: { channelId },
    });
    return overwrites.map((ow) => this.serialize(ow));
  }

  /** Create or update an overwrite (upsert on unique constraint). */
  async upsert(
    serverId: string,
    channelId: string,
    userId: string,
    data: { targetType: OverwriteTargetType; targetId: string; allow?: string; deny?: string },
  ): Promise<SerializedOverwrite> {
    // Gate: MANAGE_ROLES or MANAGE_CHANNELS
    await this.assertCanManageOverwrites(serverId, userId);

    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { serverId: true },
    });
    if (!channel || channel.serverId !== serverId) {
      throw new NotFoundException('Channel not found');
    }

    // Validate target exists
    if (data.targetType === 'ROLE') {
      const role = await this.prisma.role.findUnique({ where: { id: data.targetId } });
      if (!role || role.serverId !== serverId) {
        throw new NotFoundException('Role not found in this server');
      }
    } else {
      const member = await this.prisma.serverMember.findUnique({
        where: { serverId_userId: { serverId, userId: data.targetId } },
      });
      if (!member) throw new NotFoundException('Member not found in this server');
    }

    const allow = this.sanitizePerms(data.allow ?? '0');
    const deny = this.sanitizePerms(data.deny ?? '0');

    const ow = await this.prisma.channelOverwrite.upsert({
      where: {
        channelId_targetType_targetId: {
          channelId,
          targetType: data.targetType,
          targetId: data.targetId,
        },
      },
      create: {
        channelId,
        targetType: data.targetType,
        targetId: data.targetId,
        allow,
        deny,
      },
      update: { allow, deny },
    });

    return this.serialize(ow);
  }

  /** Delete an overwrite. */
  async delete(
    serverId: string,
    channelId: string,
    overwriteId: string,
    userId: string,
  ): Promise<{ success: true }> {
    await this.assertCanManageOverwrites(serverId, userId);

    const ow = await this.prisma.channelOverwrite.findUnique({
      where: { id: overwriteId },
      include: { channel: { select: { serverId: true } } },
    });
    if (!ow || ow.channel.serverId !== serverId || ow.channelId !== channelId) {
      throw new NotFoundException('Overwrite not found');
    }

    await this.prisma.channelOverwrite.delete({ where: { id: overwriteId } });
    return { success: true };
  }

  private sanitizePerms(permissions: string): bigint {
    let value: bigint;
    try {
      value = BigInt(permissions);
    } catch {
      throw new BadRequestException('Invalid permissions value');
    }
    return value;
  }

  private async assertCanManageOverwrites(serverId: string, userId: string): Promise<void> {
    const perms = await this.servers.getMemberPermissions(serverId, userId);
    const canManageRoles = (perms & Permission.MANAGE_ROLES) !== 0n;
    const canManageChannels = (perms & Permission.MANAGE_CHANNELS) !== 0n;
    const isAdmin = (perms & Permission.ADMINISTRATOR) !== 0n;
    if (!isAdmin && !canManageRoles && !canManageChannels) {
      throw new ForbiddenException('You need MANAGE_ROLES or MANAGE_CHANNELS permission to manage overwrites');
    }
  }
}
