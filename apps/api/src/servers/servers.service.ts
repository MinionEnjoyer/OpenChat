import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { Server, ChannelType, Role } from '@prisma/client';
import { Permission, ALL_PERMISSIONS, hasPermission } from '../permissions/permissions';

export interface SerializedServer extends Omit<Server, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'> {
  id: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  /** The requesting user's effective permission bitfield on this server, as a string. */
  myPermissions: string;
}

export interface SerializedRole {
  id: string;
  serverId: string;
  name: string;
  color: number;
  permissions: string;
  position: number;
}

export interface SerializedChannel {
  id: string;
  serverId: string;
  categoryId: string | null;
  name: string;
  type: ChannelType;
  topic: string | null;
  position: number;
  parentId: string | null;
}

@Injectable()
export class ServersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  private serializeServer(server: Server, myPermissions: bigint = 0n): SerializedServer {
    return {
      ...server,
      id: server.id.toString(),
      ownerId: server.ownerId.toString(),
      createdAt: server.createdAt.toISOString(),
      updatedAt: server.updatedAt.toISOString(),
      myPermissions: myPermissions.toString(),
    };
  }

  private serializeRole(r: Role): SerializedRole {
    return {
      id: r.id,
      serverId: r.serverId,
      name: r.name,
      color: r.color,
      permissions: r.permissions.toString(),
      position: r.position,
    };
  }

  /** Effective permissions for a user on a server (owner ⇒ all). Throws if not a member. */
  async getMemberPermissions(serverId: string, userId: string): Promise<bigint> {
    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
      select: { ownerId: true },
    });
    if (!server) throw new NotFoundException('Server not found');
    if (server.ownerId === userId) return ALL_PERMISSIONS;
    const member = await this.prisma.serverMember.findUnique({
      where: { serverId_userId: { serverId, userId } },
      include: { roles: true },
    });
    if (!member) throw new ForbiddenException('You are not a member of this server');
    return member.roles.reduce((acc, r) => acc | r.permissions, 0n);
  }

  private async assertPermission(serverId: string, userId: string, flag: bigint): Promise<void> {
    const perms = await this.getMemberPermissions(serverId, userId);
    if (!hasPermission(perms, flag)) {
      throw new ForbiddenException('You do not have permission to perform this action');
    }
  }

  async listForUser(userId: string): Promise<SerializedServer[]> {
    const members = await this.prisma.serverMember.findMany({
      where: { userId },
      include: {
        server: true,
        roles: true,
      },
    });

    return members.map((m) => {
      const perms =
        m.server.ownerId === userId
          ? ALL_PERMISSIONS
          : m.roles.reduce((acc, r) => acc | r.permissions, 0n);
      return this.serializeServer(m.server, perms);
    });
  }

  async create(userId: string, data: { name: string }): Promise<SerializedServer> {
    const result = await this.prisma.$transaction(async (tx) => {
      // Create Server
      const server = await tx.server.create({
        data: {
          name: data.name,
          ownerId: userId,
        },
      });

      // Default "Admin" role (full permissions) — the creator is the default admin.
      const adminRole = await tx.role.create({
        data: {
          serverId: server.id,
          name: 'Admin',
          color: 0x5865f2,
          permissions: Permission.ADMINISTRATOR,
          position: 1,
        },
      });

      // Create the owner's ServerMember and grant them the Admin role.
      await tx.serverMember.create({
        data: {
          serverId: server.id,
          userId: userId,
          roles: { connect: { id: adminRole.id } },
        },
      });

      // Seed a default top-level #general text channel.
      await tx.channel.create({
        data: {
          serverId: server.id,
          name: 'general',
          type: ChannelType.TEXT,
          position: 0,
        },
      });

      return server;
    });

    return this.serializeServer(result, ALL_PERMISSIONS);
  }

  async get(id: string, userId: string): Promise<SerializedServer> {
    const member = await this.prisma.serverMember.findUnique({
      where: {
        serverId_userId: {
          serverId: id,
          userId,
        },
      },
      include: { roles: true },
    });

    if (!member) {
      throw new NotFoundException('Server not found or user is not a member');
    }

    const server = await this.prisma.server.findUnique({
      where: { id },
    });

    if (!server) {
      throw new NotFoundException('Server not found');
    }

    const perms =
      server.ownerId === userId
        ? ALL_PERMISSIONS
        : member.roles.reduce((acc, r) => acc | r.permissions, 0n);

    return this.serializeServer(server, perms);
  }

  // ---- soundboard (per-server sound library) ----
  async listSounds(serverId: string, userId: string) {
    await this.get(serverId, userId); // membership check
    return this.prisma.serverSound.findMany({
      where: { serverId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, emoji: true, url: true },
    });
  }

  async addSound(serverId: string, userId: string, data: { name: string; url: string; emoji?: string | null }) {
    await this.assertPermission(serverId, userId, Permission.MANAGE_CHANNELS);
    const count = await this.prisma.serverSound.count({ where: { serverId } });
    if (count >= 500) throw new ForbiddenException('This soundboard is full (500 sounds max).');
    return this.prisma.serverSound.create({
      data: { serverId, name: data.name.slice(0, 40), url: data.url, emoji: data.emoji ?? null },
      select: { id: true, name: true, emoji: true, url: true },
    });
  }

  async updateSound(serverId: string, soundId: string, userId: string, data: { name?: string; emoji?: string | null }) {
    await this.assertPermission(serverId, userId, Permission.MANAGE_CHANNELS);
    const sound = await this.prisma.serverSound.findUnique({ where: { id: soundId }, select: { serverId: true } });
    if (!sound || sound.serverId !== serverId) throw new NotFoundException('Sound not found');
    const patch: { name?: string; emoji?: string | null } = {};
    if (data.name !== undefined) patch.name = data.name.slice(0, 40);
    if (data.emoji !== undefined) patch.emoji = data.emoji;
    return this.prisma.serverSound.update({
      where: { id: soundId },
      data: patch,
      select: { id: true, name: true, emoji: true, url: true },
    });
  }

  async deleteSound(serverId: string, soundId: string, userId: string) {
    await this.assertPermission(serverId, userId, Permission.MANAGE_CHANNELS);
    const sound = await this.prisma.serverSound.findUnique({ where: { id: soundId }, select: { serverId: true } });
    if (!sound || sound.serverId !== serverId) throw new NotFoundException('Sound not found');
    await this.prisma.serverSound.delete({ where: { id: soundId } });
    return { success: true };
  }

  async listChannels(serverId: string, userId: string): Promise<SerializedChannel[]> {
    // Assert membership first
    await this.get(serverId, userId);

    const channels = await this.prisma.channel.findMany({
      where: { serverId },
      orderBy: { position: 'asc' },
    });

    return channels.map((ch) => ({
      id: ch.id.toString(),
      serverId: ch.serverId.toString(),
      categoryId: ch.categoryId ? ch.categoryId.toString() : null,
      name: ch.name,
      type: ch.type,
      topic: ch.topic,
      position: ch.position,
      parentId: ch.parentId ? ch.parentId.toString() : null,
    }));
  }

  async createChannel(
    serverId: string,
    userId: string,
    data: { name: string; type: ChannelType; categoryId?: string },
  ): Promise<SerializedChannel> {
    // Requires the Manage Channels permission.
    await this.assertPermission(serverId, userId, Permission.MANAGE_CHANNELS);

    const channel = await this.prisma.channel.create({
      data: {
        serverId,
        name: data.name,
        type: data.type,
        categoryId: data.categoryId || null,
        position: 0, // Default position; in a real app, you'd calculate max position + 1
      },
    });

    return {
      id: channel.id.toString(),
      serverId: channel.serverId.toString(),
      categoryId: channel.categoryId ? channel.categoryId.toString() : null,
      name: channel.name,
      type: channel.type,
      topic: channel.topic,
      position: channel.position,
      parentId: channel.parentId ? channel.parentId.toString() : null,
    };
  }

  async listMembers(serverId: string, userId: string) {
    const server = await this.get(serverId, userId); // assert membership
    const members = await this.prisma.serverMember.findMany({
      where: { serverId },
      include: { user: true, roles: true },
      orderBy: { joinedAt: 'asc' },
    });
    return members.map((m) => ({
      userId: m.userId,
      nickname: m.nickname,
      joinedAt: m.joinedAt.toISOString(),
      isOwner: m.userId === server.ownerId,
      roleIds: m.roles.map((r) => r.id),
      user: {
        id: m.user.id,
        username: m.user.username,
        displayName: m.user.displayName,
        avatarUrl: m.user.avatarUrl,
        status: m.user.status,
      },
    }));
  }

  // ---- Roles ----

  async listRoles(serverId: string, userId: string): Promise<SerializedRole[]> {
    await this.get(serverId, userId); // assert membership
    const roles = await this.prisma.role.findMany({
      where: { serverId },
      orderBy: { position: 'desc' },
    });
    return roles.map((r) => this.serializeRole(r));
  }

  private sanitizePerms(permissions: string): bigint {
    let value: bigint;
    try {
      value = BigInt(permissions);
    } catch {
      throw new BadRequestException('Invalid permissions value');
    }
    // Drop any bits that aren't real permissions.
    return value & ALL_PERMISSIONS;
  }

  async createRole(
    serverId: string,
    userId: string,
    data: { name: string; color?: number; permissions?: string },
  ): Promise<SerializedRole> {
    await this.assertPermission(serverId, userId, Permission.MANAGE_ROLES);
    const top = await this.prisma.role.findFirst({
      where: { serverId },
      orderBy: { position: 'desc' },
    });
    const role = await this.prisma.role.create({
      data: {
        serverId,
        name: data.name.trim() || 'new role',
        color: data.color ?? 0,
        permissions: this.sanitizePerms(data.permissions ?? '0'),
        position: (top?.position ?? 0) + 1,
      },
    });
    return this.serializeRole(role);
  }

  async updateRole(
    serverId: string,
    roleId: string,
    userId: string,
    data: { name?: string; color?: number; permissions?: string },
  ): Promise<SerializedRole> {
    await this.assertPermission(serverId, userId, Permission.MANAGE_ROLES);
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role || role.serverId !== serverId) throw new NotFoundException('Role not found');
    const updated = await this.prisma.role.update({
      where: { id: roleId },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() || role.name } : {}),
        ...(data.color !== undefined ? { color: data.color } : {}),
        ...(data.permissions !== undefined ? { permissions: this.sanitizePerms(data.permissions) } : {}),
      },
    });
    return this.serializeRole(updated);
  }

  async deleteRole(serverId: string, roleId: string, userId: string): Promise<{ success: true }> {
    await this.assertPermission(serverId, userId, Permission.MANAGE_ROLES);
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role || role.serverId !== serverId) throw new NotFoundException('Role not found');
    await this.prisma.role.delete({ where: { id: roleId } });
    return { success: true };
  }

  async setMemberRole(
    serverId: string,
    targetUserId: string,
    roleId: string,
    userId: string,
    assign: boolean,
  ): Promise<{ success: true }> {
    await this.assertPermission(serverId, userId, Permission.MANAGE_ROLES);
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role || role.serverId !== serverId) throw new NotFoundException('Role not found');
    const member = await this.prisma.serverMember.findUnique({
      where: { serverId_userId: { serverId, userId: targetUserId } },
    });
    if (!member) throw new NotFoundException('Member not found');
    await this.prisma.serverMember.update({
      where: { serverId_userId: { serverId, userId: targetUserId } },
      data: { roles: assign ? { connect: { id: roleId } } : { disconnect: { id: roleId } } },
    });
    return { success: true };
  }

  // ---- Members / server management ----

  /**
   * Invite a user to the server. This creates a PENDING invitation the invitee must accept;
   * it does NOT add them directly. Requires the Create Invites permission.
   */
  async inviteMember(serverId: string, inviterId: string, inviteeId: string) {
    await this.assertPermission(serverId, inviterId, Permission.CREATE_INVITE);
    const target = await this.prisma.user.findUnique({ where: { id: inviteeId } });
    if (!target) throw new NotFoundException('User not found');
    if (inviteeId === inviterId) throw new BadRequestException('You are already in this server');
    const existingMember = await this.prisma.serverMember.findUnique({
      where: { serverId_userId: { serverId, userId: inviteeId } },
    });
    if (existingMember) throw new BadRequestException('User is already a member of this server');

    // Upsert the invitation; if a prior one was declined, re-open it as PENDING.
    const invitation = await this.prisma.serverInvitation.upsert({
      where: { serverId_inviteeId: { serverId, inviteeId } },
      create: { serverId, inviterId, inviteeId, status: 'PENDING' },
      update: { status: 'PENDING', inviterId },
    });
    // Live-notify the invitee so it shows in their notification hub without a refresh.
    this.redis.publish('chat:events', { type: 'NOTIFY', userId: inviteeId }).catch(() => {});
    return { id: invitation.id, status: invitation.status };
  }

  async listIncomingInvitations(userId: string) {
    const invites = await this.prisma.serverInvitation.findMany({
      where: { inviteeId: userId, status: 'PENDING' },
      include: { server: true, inviter: true },
      orderBy: { createdAt: 'desc' },
    });
    return invites.map((i) => ({
      id: i.id,
      createdAt: i.createdAt.toISOString(),
      server: { id: i.server.id, name: i.server.name, iconUrl: i.server.iconUrl },
      inviter: {
        id: i.inviter.id,
        username: i.inviter.username,
        displayName: i.inviter.displayName,
        avatarUrl: i.inviter.avatarUrl,
      },
    }));
  }

  async acceptInvitation(invitationId: string, userId: string): Promise<SerializedServer> {
    const invitation = await this.prisma.serverInvitation.findUnique({ where: { id: invitationId } });
    if (!invitation || invitation.inviteeId !== userId) throw new NotFoundException('Invitation not found');
    if (invitation.status !== 'PENDING') throw new BadRequestException('Invitation is no longer pending');
    const server = await this.prisma.$transaction(async (tx) => {
      await tx.serverMember.upsert({
        where: { serverId_userId: { serverId: invitation.serverId, userId } },
        create: { serverId: invitation.serverId, userId },
        update: {},
      });
      await tx.serverInvitation.update({ where: { id: invitationId }, data: { status: 'ACCEPTED' } });
      return tx.server.findUniqueOrThrow({ where: { id: invitation.serverId } });
    });
    const perms = await this.getMemberPermissions(server.id, userId);
    return this.serializeServer(server, perms);
  }

  async declineInvitation(invitationId: string, userId: string): Promise<{ success: true }> {
    const invitation = await this.prisma.serverInvitation.findUnique({ where: { id: invitationId } });
    if (!invitation || invitation.inviteeId !== userId) throw new NotFoundException('Invitation not found');
    await this.prisma.serverInvitation.update({
      where: { id: invitationId },
      data: { status: 'DECLINED' },
    });
    return { success: true };
  }

  async reorderChannels(serverId: string, userId: string, orderedIds: string[]): Promise<{ success: true }> {
    await this.assertPermission(serverId, userId, Permission.MANAGE_CHANNELS);
    const channels = await this.prisma.channel.findMany({ where: { serverId }, select: { id: true } });
    const valid = new Set(channels.map((c) => c.id));
    const ids = orderedIds.filter((id) => valid.has(id));
    await this.prisma.$transaction(
      ids.map((id, index) => this.prisma.channel.update({ where: { id }, data: { position: index } })),
    );
    return { success: true };
  }

  async deleteChannel(serverId: string, channelId: string, userId: string): Promise<{ success: true }> {
    await this.assertPermission(serverId, userId, Permission.MANAGE_CHANNELS);
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId }, select: { serverId: true } });
    if (!channel || channel.serverId !== serverId) throw new NotFoundException('Channel not found');
    await this.prisma.channel.delete({ where: { id: channelId } });
    return { success: true };
  }

  async kickMember(serverId: string, targetUserId: string, userId: string): Promise<{ success: true }> {
    await this.assertPermission(serverId, userId, Permission.MANAGE_MEMBERS);
    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
      select: { ownerId: true },
    });
    if (!server) throw new NotFoundException('Server not found');
    if (server.ownerId === targetUserId) throw new ForbiddenException('Cannot kick the server owner');
    if (targetUserId === userId) throw new BadRequestException('Use "leave" to remove yourself');
    await this.prisma.serverMember.delete({
      where: { serverId_userId: { serverId, userId: targetUserId } },
    });
    return { success: true };
  }

  async updateServer(
    serverId: string,
    userId: string,
    data: { name?: string; iconUrl?: string },
  ): Promise<SerializedServer> {
    await this.assertPermission(serverId, userId, Permission.MANAGE_SERVER);
    const server = await this.prisma.server.update({
      where: { id: serverId },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.iconUrl !== undefined ? { iconUrl: data.iconUrl || null } : {}),
      },
    });
    const perms = await this.getMemberPermissions(serverId, userId);
    return this.serializeServer(server, perms);
  }

  async deleteServer(serverId: string, userId: string): Promise<{ success: true }> {
    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
      select: { ownerId: true },
    });
    if (!server) throw new NotFoundException('Server not found');
    if (server.ownerId !== userId) throw new ForbiddenException('Only the owner can delete the server');
    // Invites and audit logs don't cascade from Server; remove them first, then the
    // server delete cascades channels (→ messages), members, roles and categories.
    await this.prisma.$transaction([
      this.prisma.invite.deleteMany({ where: { serverId } }),
      this.prisma.auditLog.deleteMany({ where: { serverId } }),
      this.prisma.server.delete({ where: { id: serverId } }),
    ]);
    return { success: true };
  }

  async leave(serverId: string, userId: string) {
    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
      select: { ownerId: true },
    });
    if (!server) throw new NotFoundException('Server not found');
    if (server.ownerId === userId) {
      throw new ForbiddenException(
        'The owner cannot leave; delete the server or transfer ownership first',
      );
    }
    await this.prisma.serverMember.delete({
      where: { serverId_userId: { serverId, userId } },
    });
    return { success: true };
  }
}
