import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException, Inject, forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { Server, ChannelType, Role } from '@prisma/client';
import { OverwritesService } from '../overwrites/overwrites.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { Permission, ALL_PERMISSIONS, hasPermission, resolveEffectivePermissions, DEFAULT_MEMBER_PERMISSIONS } from '../permissions/permissions';

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
  mentionable: boolean;
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
    @Inject(forwardRef(() => OverwritesService)) private readonly overwrites: OverwritesService,
    private readonly auditLog: AuditLogService,
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
      mentionable: r.mentionable ?? true,
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

      // Default "@everyone" role — base permissions for all members (FR-ROLE-003).
      await tx.role.create({
        data: {
          serverId: server.id,
          name: '@everyone',
          color: 0x99aab5,
          permissions: DEFAULT_MEMBER_PERMISSIONS,
          position: 0,
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

  async listCategories(serverId: string, userId: string) {
    await this.get(serverId, userId);
    const categories = await this.prisma.category.findMany({
      where: { serverId },
      orderBy: { position: 'asc' },
    });
    return categories.map((c) => ({
      id: c.id,
      serverId: c.serverId,
      name: c.name,
      position: c.position,
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

    await this.auditLog.write({
      serverId, actorId: userId, action: "CHANNEL_CREATE",
      targetType: "channel", targetId: channel.id,
    });

    const serializedChannel = {
      id: channel.id.toString(),
      serverId: channel.serverId.toString(),
      categoryId: channel.categoryId ? channel.categoryId.toString() : null,
      name: channel.name,
      type: channel.type,
      topic: channel.topic,
      position: channel.position,
      parentId: channel.parentId ? channel.parentId.toString() : null,
    };
    this.redis.publish('chat:events', { type: 'CHANNEL_CREATED', serverId, channel: serializedChannel }).catch(() => {});

    return serializedChannel;
  }

  async updateChannel(
    serverId: string,
    channelId: string,
    userId: string,
    data: { name?: string; topic?: string | null; categoryId?: string | null },
  ): Promise<SerializedChannel> {
    await this.assertPermission(serverId, userId, Permission.MANAGE_CHANNELS);
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId }, select: { serverId: true } });
    if (!channel || channel.serverId !== serverId) throw new NotFoundException('Channel not found');

    const updated = await this.prisma.channel.update({
      where: { id: channelId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.topic !== undefined ? { topic: data.topic } : {}),
        ...(data.categoryId !== undefined ? { categoryId: data.categoryId } : {}),
      },
    });

    const serialized = {
      id: updated.id.toString(),
      serverId: updated.serverId!.toString(),
      categoryId: updated.categoryId ? updated.categoryId.toString() : null,
      name: updated.name,
      type: updated.type,
      topic: updated.topic,
      position: updated.position,
      parentId: updated.parentId ? updated.parentId.toString() : null,
    };

    this.redis.publish('chat:events', { type: 'CHANNEL_UPDATED', serverId, channel: serialized }).catch(() => {});

    return serialized;
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
        customStatus: m.user.customStatus,
        bio: m.user.bio,
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
    // FR-ROLE-001: must NOT mask against ALL_PERMISSIONS — BigInt round-trip
    // must be exact for any valid BigInt. Permission checking happens at
    // authorization time via hasPermission(), not at persist time.
    return value;
  }

  async createRole(
    serverId: string,
    userId: string,
    data: { name: string; color?: number; permissions?: string; mentionable?: boolean },
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
        mentionable: data.mentionable ?? true,
      },
    });

    await this.auditLog.write({
      serverId, actorId: userId, action: 'ROLE_CREATE',
      targetType: 'role', targetId: role.id,
      metadata: { name: role.name, permissions: role.permissions.toString() },
    });
    const serializedRole = this.serializeRole(role);
    this.redis.publish('chat:events', { type: 'ROLE_CREATED', serverId, role: serializedRole }).catch(() => {});
    return serializedRole;
  }

  async updateRole(
    serverId: string,
    roleId: string,
    userId: string,
    data: { name?: string; color?: number; permissions?: string; mentionable?: boolean },
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
        ...(data.mentionable !== undefined ? { mentionable: data.mentionable } : {}),
      },
    });

    await this.auditLog.write({
      serverId, actorId: userId, action: 'ROLE_UPDATE',
      targetType: 'role', targetId: roleId,
      metadata: { changes: data },
    });
    const serializedRole = this.serializeRole(updated);
    this.redis.publish('chat:events', { type: 'ROLE_UPDATED', serverId, role: serializedRole }).catch(() => {});
    return serializedRole;
  }

  async deleteRole(serverId: string, roleId: string, userId: string): Promise<{ success: true }> {
    await this.assertPermission(serverId, userId, Permission.MANAGE_ROLES);
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role || role.serverId !== serverId) throw new NotFoundException('Role not found');
    await this.prisma.role.delete({ where: { id: roleId } });
      await this.auditLog.write({
        serverId, actorId: userId, action: 'ROLE_DELETE',
        targetType: 'role', targetId: roleId,
        metadata: { name: role.name },
      });
    this.redis.publish('chat:events', { type: 'ROLE_DELETED', serverId, roleId }).catch(() => {});
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

    const action = assign ? 'ROLE_ASSIGN' as const : 'ROLE_UNASSIGN' as const;
    await this.auditLog.write({
      serverId, actorId: userId, action,
      targetType: 'member', targetId: targetUserId,
      metadata: { roleId, roleName: role.name },
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
    const memberRecord = await this.prisma.serverMember.findUnique({
      where: { serverId_userId: { serverId: invitation.serverId, userId } },
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
    this.redis.publish('chat:events', { type: 'MEMBER_JOINED', serverId: invitation.serverId, userId, member }).catch(() => {});
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

    await this.auditLog.write({
      serverId, actorId: userId, action: "CHANNEL_DELETE",
      targetType: "channel", targetId: channelId,
    });

    this.redis.publish('chat:events', { type: 'CHANNEL_DELETED', serverId, channelId }).catch(() => {});

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

    await this.auditLog.write({
      serverId,
      actorId: userId,
      action: 'KICK',
      targetType: 'member',
      targetId: targetUserId,
    });

    this.redis.publish('chat:events', { type: 'MEMBER_KICKED', serverId, userId: targetUserId }).catch(() => {});

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

    await this.auditLog.write({
      serverId, actorId: userId, action: 'SERVER_UPDATE',
      targetType: 'server', targetId: serverId,
      metadata: { changes: data },
    });

    const perms = await this.getMemberPermissions(serverId, userId);
    const serializedServer = this.serializeServer(server, perms);
    this.redis.publish('chat:events', { type: 'SERVER_UPDATED', serverId, server: serializedServer }).catch(() => {});
    return serializedServer;
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
    this.redis.publish('chat:events', { type: 'SERVER_DELETED', serverId }).catch(() => {});
    return { success: true };
  }

  // ---- Timeout (FR-ROLE-005) ----

  /** Set or update a timeout for a member (gated: MANAGE_MEMBERS). */
  async setTimeout(serverId: string, targetUserId: string, until: Date, actorId: string) {
    await this.assertPermission(serverId, actorId, Permission.MANAGE_MEMBERS);
    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
      select: { ownerId: true },
    });
    if (!server) throw new NotFoundException('Server not found');
    if (server.ownerId === targetUserId) throw new ForbiddenException('Cannot timeout the server owner');

    const member = await this.prisma.serverMember.findUnique({
      where: { serverId_userId: { serverId, userId: targetUserId } },
      select: { timedOutUntil: true },
    });
    if (!member) throw new NotFoundException('Member not found');

    // Cap at 28 days from now
    const max = new Date(Date.now() + 28 * 24 * 60 * 60 * 1000);
    const capped = until > max ? max : until;
    if (capped <= new Date()) throw new BadRequestException('Timeout must be in the future');

    await this.prisma.serverMember.update({
      where: { serverId_userId: { serverId, userId: targetUserId } },
      data: { timedOutUntil: capped },
    });

    return { timedOutUntil: capped.toISOString() };
  }

  /** Clear a member's timeout (gated: MANAGE_MEMBERS). */
  async clearTimeout(serverId: string, targetUserId: string, actorId: string) {
    await this.assertPermission(serverId, actorId, Permission.MANAGE_MEMBERS);
    const member = await this.prisma.serverMember.findUnique({
      where: { serverId_userId: { serverId, userId: targetUserId } },
      select: { timedOutUntil: true },
    });
    if (!member) throw new NotFoundException('Member not found');

    await this.prisma.serverMember.update({
      where: { serverId_userId: { serverId, userId: targetUserId } },
      data: { timedOutUntil: null },
    });

    return { success: true };
  }

  /** Check whether a user is timed out in a given server. Throws 403 if so. */
  async assertNotTimedOut(serverId: string, userId: string): Promise<void> {
    const member = await this.prisma.serverMember.findUnique({
      where: { serverId_userId: { serverId, userId } },
      select: { timedOutUntil: true },
    });
    if (member?.timedOutUntil && member.timedOutUntil > new Date()) {
      throw new ForbiddenException({
        message: 'You are timed out',
        code: 'timed_out',
      });
    }
  }


  // ---- Bans (P7 add_ban) ----

  async listBans(serverId: string, userId: string) {
    await this.assertPermission(serverId, userId, Permission.BAN_MEMBERS);
    const bans = await this.prisma.ban.findMany({
      where: { serverId },
      include: {
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        createdBy: { select: { id: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return bans.map((b) => ({
      id: b.id,
      userId: b.userId,
      serverId: b.serverId,
      reason: b.reason,
      createdById: b.createdById,
      deleteMessageDays: b.deleteMessageDays,
      createdAt: b.createdAt.toISOString(),
      user: b.user,
      createdBy: b.createdBy,
    }));
  }

  async banMember(
    serverId: string,
    targetUserId: string,
    actorId: string,
    opts: { reason?: string; deleteMessageDays?: number },
  ) {
    await this.assertPermission(serverId, actorId, Permission.BAN_MEMBERS);
    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
      select: { ownerId: true },
    });
    if (!server) throw new NotFoundException('Server not found');
    if (server.ownerId === targetUserId) throw new ForbiddenException('Cannot ban the server owner');
    if (targetUserId === actorId) throw new BadRequestException('You cannot ban yourself');

    // Check if already banned
    const existing = await this.prisma.ban.findUnique({
      where: { serverId_userId: { serverId, userId: targetUserId } },
    });
    if (existing) throw new BadRequestException('User is already banned');

    const deleteMessageDays = opts.deleteMessageDays !== undefined
      ? Math.max(0, Math.min(7, opts.deleteMessageDays))
      : undefined;

    const result = await this.prisma.$transaction(async (tx) => {
      // Purge messages if requested
      if (deleteMessageDays && deleteMessageDays > 0) {
        const cutoff = new Date(Date.now() - deleteMessageDays * 24 * 60 * 60 * 1000);
        const channels = await tx.channel.findMany({
          where: { serverId },
          select: { id: true },
        });
        const channelIds = channels.map((c) => c.id);
        if (channelIds.length > 0) {
          await tx.message.updateMany({
            where: {
              channelId: { in: channelIds },
              authorId: targetUserId,
              createdAt: { gte: cutoff },
            },
            data: { deletedAt: new Date() },
          });
        }
      }

      // Remove from server members
      await tx.serverMember.deleteMany({
        where: { serverId, userId: targetUserId },
      });

      // Create ban record
      const ban = await tx.ban.create({
        data: {
          serverId,
          userId: targetUserId,
          reason: opts.reason ?? null,
          createdById: actorId,
          deleteMessageDays: deleteMessageDays ?? null,
        },
        include: {
          user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
          createdBy: { select: { id: true, username: true } },
        },
      });

      return ban;
    });

    this.redis.publish('chat:events', { type: 'MEMBER_KICKED', serverId, userId: targetUserId }).catch(() => {});
    return { ...result, createdAt: result.createdAt.toISOString() };
  }

  async unbanMember(serverId: string, targetUserId: string, actorId: string) {
    await this.assertPermission(serverId, actorId, Permission.BAN_MEMBERS);
    const ban = await this.prisma.ban.findUnique({
      where: { serverId_userId: { serverId, userId: targetUserId } },
    });
    if (!ban) throw new NotFoundException('Ban not found');
    await this.prisma.ban.delete({
      where: { serverId_userId: { serverId, userId: targetUserId } },
    });
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

      await this.auditLog.write({
        serverId,
        actorId: userId,
        action: "MEMBER_LEAVE",
        targetType: "member",
        targetId: userId,
      });

    this.redis.publish('chat:events', { type: 'MEMBER_LEFT', serverId, userId }).catch(() => {});
    return { success: true };
  }

  // ---- Channel permission overwrites (FR-ROLE-003) x-added-by P7 ----

  async listOverwrites(serverId: string, channelId: string, userId: string) {
    return this.overwrites.list(serverId, channelId, userId);
  }

  async upsertOverwrite(
    serverId: string,
    channelId: string,
    userId: string,
    data: { targetType: 'ROLE' | 'MEMBER'; targetId: string; allow?: string; deny?: string },
  ) {
    return this.overwrites.upsert(serverId, channelId, userId, data);
  }

  async deleteOverwrite(serverId: string, channelId: string, overwriteId: string, userId: string) {
    return this.overwrites.delete(serverId, channelId, overwriteId, userId);
  }

  /**
   * Compute effective permissions for a user on a specific channel,
   * incorporating channel permission overwrites.
   * Returns the effective BigInt permission bitfield.
   */
  async getChannelPermissions(serverId: string, channelId: string, userId: string): Promise<bigint> {
    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
      select: { ownerId: true },
    });
    if (!server) throw new NotFoundException('Server not found');

    const isOwner = server.ownerId === userId;

    const member = await this.prisma.serverMember.findUnique({
      where: { serverId_userId: { serverId, userId } },
      include: { roles: true },
    });
    if (!member) throw new ForbiddenException('Not a member of this server');

    // Find @everyone role for base permissions
    const everyoneRole = await this.prisma.role.findFirst({
      where: { serverId, name: '@everyone' },
    });
    const everyonePermissions = everyoneRole?.permissions ?? 0n;

    // Union of all non-@everyone role permissions
    const rolePermissions = member.roles
      .filter((r) => r.name !== '@everyone')
      .reduce((acc, r) => acc | r.permissions, 0n);

    const memberRoleIds = new Set(member.roles.map((r) => r.id));

    // Load channel overwrites
    const overwriteRecords = await this.prisma.channelOverwrite.findMany({
      where: { channelId },
    });

    const overwrites = overwriteRecords.map((ow) => ({
      targetType: ow.targetType as 'ROLE' | 'MEMBER',
      targetId: ow.targetId,
      allow: ow.allow,
      deny: ow.deny,
    }));

    return resolveEffectivePermissions({
      everyonePermissions,
      rolePermissions,
      memberRoleIds,
      userId,
      overwrites,
      isOwner,
    });
  }
}
