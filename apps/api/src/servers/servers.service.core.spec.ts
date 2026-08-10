import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ChannelType } from '@prisma/client';
import { ALL_PERMISSIONS, DEFAULT_MEMBER_PERMISSIONS, Permission } from '../permissions/permissions';
import { ServersService } from './servers.service';

describe('ServersService core lifecycle', () => {
  const now = new Date('2026-08-09T12:00:00.000Z');
  const server = {
    id: 'server-1', ownerId: 'owner-1', name: 'Server', iconUrl: null,
    createdAt: now, updatedAt: now,
  };
  const channel = {
    id: 'channel-1', serverId: 'server-1', categoryId: null, name: 'general',
    type: ChannelType.TEXT, topic: null, position: 0, parentId: null, isDefault: false,
  };
  const role = {
    id: 'role-1', serverId: 'server-1', name: 'Moderator', color: 123,
    permissions: Permission.MANAGE_CHANNELS, position: 1, mentionable: true,
  };
  const member = {
    userId: 'member-1', nickname: null, joinedAt: now, timedOutUntil: null,
    roles: [role],
    user: {
      id: 'member-1', username: 'member', displayName: 'Member', avatarUrl: null,
      status: 'ONLINE', customStatus: null, bio: null, isBot: false,
    },
  };

  function makeService() {
    const table = () => ({
      findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(),
      create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), upsert: jest.fn(),
      delete: jest.fn(), deleteMany: jest.fn(), count: jest.fn(),
    });
    const prisma: any = {
      server: table(), serverMember: table(), role: table(), channel: table(), channelOverwrite: table(), category: table(),
      serverSound: table(), serverSticker: table(), serverInvitation: table(), user: table(),
      invite: table(), auditLog: table(), ban: table(), message: table(),
    };
    prisma.server.findUnique.mockResolvedValue(server);
    prisma.server.findUniqueOrThrow.mockResolvedValue(server);
    prisma.serverMember.findUnique.mockResolvedValue(member);
    prisma.serverMember.findMany.mockResolvedValue([]);
    prisma.role.findUnique.mockResolvedValue(role);
    prisma.role.findFirst.mockResolvedValue(role);
    prisma.role.findMany.mockResolvedValue([role]);
    prisma.channel.findUnique.mockResolvedValue(channel);
    prisma.channel.findFirst.mockResolvedValue(null);
    prisma.channel.findMany.mockResolvedValue([channel]);
    prisma.channel.create.mockResolvedValue(channel);
    prisma.channel.update.mockResolvedValue(channel);
    prisma.category.findMany.mockResolvedValue([]);
    prisma.serverSound.count.mockResolvedValue(0);
    prisma.serverSound.findUnique.mockResolvedValue({ serverId: 'server-1' });
    prisma.serverSticker.count.mockResolvedValue(0);
    prisma.serverSticker.findUnique.mockResolvedValue({ serverId: 'server-1' });
    prisma.user.findUnique.mockResolvedValue(member.user);
    prisma.serverInvitation.findMany.mockResolvedValue([]);
    prisma.ban.findMany.mockResolvedValue([]);
    prisma.$transaction = jest.fn(async (input: any) => {
      if (typeof input === 'function') return input(prisma);
      return Promise.all(input);
    });
    const redis = { publish: jest.fn().mockResolvedValue(1) } as any;
    const overwrites = {
      list: jest.fn(), upsert: jest.fn(), delete: jest.fn(),
    } as any;
    const auditLog = { write: jest.fn().mockResolvedValue(undefined) } as any;
    return { service: new ServersService(prisma, redis, overwrites, auditLog), prisma, redis, overwrites, auditLog };
  }

  it('computes owner and role-derived membership permissions with stable errors', async () => {
    const owner = makeService();
    await expect(owner.service.getMemberPermissions('server-1', 'owner-1')).resolves.toBe(ALL_PERMISSIONS);

    const regular = makeService();
    regular.prisma.server.findUnique.mockResolvedValue({ ownerId: 'owner-1' });
    regular.prisma.serverMember.findUnique.mockResolvedValue({ roles: [
      { permissions: Permission.MANAGE_CHANNELS }, { permissions: Permission.MANAGE_ROLES },
    ] });
    await expect(regular.service.getMemberPermissions('server-1', 'member-1'))
      .resolves.toBe(Permission.MANAGE_CHANNELS | Permission.MANAGE_ROLES);

    const missingServer = makeService();
    missingServer.prisma.server.findUnique.mockResolvedValue(null);
    await expect(missingServer.service.getMemberPermissions('missing', 'user')).rejects.toBeInstanceOf(NotFoundException);

    const nonMember = makeService();
    nonMember.prisma.server.findUnique.mockResolvedValue({ ownerId: 'owner-1' });
    nonMember.prisma.serverMember.findUnique.mockResolvedValue(null);
    await expect(nonMember.service.getMemberPermissions('server-1', 'outsider')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lists and retrieves servers with serialized permissions and timestamps', async () => {
    const { service, prisma } = makeService();
    prisma.serverMember.findMany.mockResolvedValue([
      { server, roles: [], userId: 'owner-1' },
      { server: { ...server, id: 'server-2', ownerId: 'other' }, roles: [role], userId: 'owner-1' },
    ]);
    await expect(service.listForUser('owner-1')).resolves.toEqual([
      expect.objectContaining({ id: 'server-1', myPermissions: ALL_PERMISSIONS.toString(), createdAt: now.toISOString() }),
      expect.objectContaining({ id: 'server-2', myPermissions: Permission.MANAGE_CHANNELS.toString() }),
    ]);

    prisma.serverMember.findUnique.mockResolvedValue({ roles: [role] });
    await expect(service.get('server-1', 'member-1')).resolves.toMatchObject({ myPermissions: '4' });
    prisma.serverMember.findUnique.mockResolvedValue(null);
    await expect(service.get('server-1', 'outsider')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates a server with default roles, owner membership, and primary channel', async () => {
    const { service, prisma } = makeService();
    prisma.server.create.mockResolvedValue(server);
    prisma.role.create
      .mockResolvedValueOnce({ ...role, id: 'everyone', name: '@everyone' })
      .mockResolvedValueOnce({ ...role, id: 'admin', name: 'Admin', permissions: Permission.ADMINISTRATOR });

    await expect(service.create('owner-1', { name: 'Server' })).resolves.toMatchObject({
      id: 'server-1', ownerId: 'owner-1', myPermissions: ALL_PERMISSIONS.toString(),
    });
    expect(prisma.role.create).toHaveBeenNthCalledWith(1, { data: expect.objectContaining({
      name: '@everyone', permissions: DEFAULT_MEMBER_PERMISSIONS, position: 0,
    }) });
    expect(prisma.serverMember.create).toHaveBeenCalledWith({ data: {
      serverId: 'server-1', userId: 'owner-1', roles: { connect: { id: 'admin' } },
    } });
    expect(prisma.channel.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      name: 'general', type: ChannelType.TEXT, isDefault: true,
    }) });
  });

  it('covers the soundboard lifecycle, capacity, truncation, and server scoping', async () => {
    const { service, prisma } = makeService();
    prisma.serverSound.findMany.mockResolvedValue([{ id: 'sound-1' }]);
    await expect(service.listSounds('server-1', 'owner-1')).resolves.toEqual([{ id: 'sound-1' }]);

    prisma.serverSound.create.mockResolvedValue({ id: 'sound-1' });
    await service.addSound('server-1', 'owner-1', { name: 'x'.repeat(50), url: '/sound', emoji: '🔊' });
    expect(prisma.serverSound.create).toHaveBeenCalledWith({
      data: { serverId: 'server-1', name: 'x'.repeat(40), url: '/sound', emoji: '🔊' },
      select: { id: true, name: true, emoji: true, url: true },
    });
    prisma.serverSound.count.mockResolvedValue(500);
    await expect(service.addSound('server-1', 'owner-1', { name: 'full', url: '/sound' }))
      .rejects.toBeInstanceOf(ForbiddenException);

    prisma.serverSound.count.mockResolvedValue(0);
    prisma.serverSound.update.mockResolvedValue({ id: 'sound-1' });
    await service.updateSound('server-1', 'sound-1', 'owner-1', { name: 'y'.repeat(50), emoji: null });
    expect(prisma.serverSound.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { name: 'y'.repeat(40), emoji: null },
    }));
    await expect(service.deleteSound('server-1', 'sound-1', 'owner-1')).resolves.toEqual({ success: true });

    prisma.serverSound.findUnique.mockResolvedValue({ serverId: 'other' });
    await expect(service.deleteSound('server-1', 'sound-1', 'owner-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists, creates, updates, and broadcasts scoped channels and categories', async () => {
    const { service, prisma, redis, auditLog } = makeService();
    prisma.category.findMany.mockResolvedValue([{ id: 'cat-1', serverId: 'server-1', name: 'Info', position: 1 }]);
    await expect(service.listChannels('server-1', 'owner-1')).resolves.toEqual([channel]);
    await expect(service.listCategories('server-1', 'owner-1')).resolves.toEqual([
      { id: 'cat-1', serverId: 'server-1', name: 'Info', position: 1 },
    ]);

    await expect(service.createChannel('server-1', 'owner-1', {
      name: 'new', type: ChannelType.TEXT, categoryId: 'cat-1',
    })).resolves.toEqual(channel);
    expect(auditLog.write).toHaveBeenCalledWith(expect.objectContaining({ action: 'CHANNEL_CREATE' }));
    expect(redis.publish).toHaveBeenCalledWith('chat:events', expect.objectContaining({ type: 'CHANNEL_CREATED' }));

    await service.updateChannel('server-1', 'channel-1', 'owner-1', {
      name: 'renamed', topic: null, categoryId: null,
    });
    expect(prisma.channel.update).toHaveBeenCalledWith({
      where: { id: 'channel-1' }, data: { name: 'renamed', topic: null, categoryId: null },
    });
    expect(redis.publish).toHaveBeenCalledWith('chat:events', expect.objectContaining({ type: 'CHANNEL_UPDATED' }));

    prisma.channel.findUnique.mockResolvedValue({ serverId: 'other' });
    await expect(service.updateChannel('server-1', 'channel-1', 'owner-1', {})).rejects.toBeInstanceOf(NotFoundException);
  });

  it('projects members and roles without leaking Prisma BigInts', async () => {
    const { service, prisma } = makeService();
    prisma.serverMember.findMany.mockResolvedValue([member]);
    await expect(service.listMembers('server-1', 'owner-1')).resolves.toEqual([expect.objectContaining({
      userId: 'member-1', joinedAt: now.toISOString(), isOwner: false, roleIds: ['role-1'],
      user: expect.objectContaining({ username: 'member' }),
    })]);
    await expect(service.listRoles('server-1', 'owner-1')).resolves.toEqual([{
      id: 'role-1', serverId: 'server-1', name: 'Moderator', color: 123,
      permissions: '4', position: 1, mentionable: true,
    }]);
  });

  it('creates, updates, deletes, assigns, and unassigns roles with audits', async () => {
    const { service, prisma, redis, auditLog } = makeService();
    prisma.role.create.mockResolvedValue(role);
    await service.createRole('server-1', 'owner-1', {
      name: '  ', color: 9, permissions: '4', mentionable: false,
    });
    expect(prisma.role.create).toHaveBeenCalledWith({ data: {
      serverId: 'server-1', name: 'new role', color: 9, permissions: 4n, position: 2, mentionable: false,
    } });
    expect(redis.publish).toHaveBeenCalledWith('chat:events', expect.objectContaining({ type: 'ROLE_CREATED' }));

    prisma.role.update.mockResolvedValue({ ...role, name: 'Changed', permissions: 8n, mentionable: false });
    await service.updateRole('server-1', 'role-1', 'owner-1', {
      name: 'Changed', color: 77, permissions: '8', mentionable: false,
    });
    expect(auditLog.write).toHaveBeenCalledWith(expect.objectContaining({ action: 'ROLE_UPDATE' }));
    await expect(service.deleteRole('server-1', 'role-1', 'owner-1')).resolves.toEqual({ success: true });
    expect(redis.publish).toHaveBeenCalledWith('chat:events', expect.objectContaining({ type: 'ROLE_DELETED' }));

    await service.setMemberRole('server-1', 'member-1', 'role-1', 'owner-1', true);
    expect(prisma.serverMember.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { roles: { connect: { id: 'role-1' } } },
    }));
    await service.setMemberRole('server-1', 'member-1', 'role-1', 'owner-1', false);
    expect(prisma.serverMember.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: { roles: { disconnect: { id: 'role-1' } } },
    }));

    await expect(service.createRole('server-1', 'owner-1', { name: 'bad', permissions: 'bad' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects cross-server roles and missing members in role management', async () => {
    const wrongRole = makeService();
    wrongRole.prisma.role.findUnique.mockResolvedValue({ ...role, serverId: 'other' });
    await expect(wrongRole.service.updateRole('server-1', 'role-1', 'owner-1', {})).rejects.toBeInstanceOf(NotFoundException);
    await expect(wrongRole.service.deleteRole('server-1', 'role-1', 'owner-1')).rejects.toBeInstanceOf(NotFoundException);

    const missingMember = makeService();
    missingMember.prisma.serverMember.findUnique.mockResolvedValue(null);
    await expect(missingMember.service.setMemberRole('server-1', 'missing', 'role-1', 'owner-1', true))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates and lists pending server invitations with notification delivery', async () => {
    const { service, prisma, redis } = makeService();
    prisma.serverInvitation.upsert.mockResolvedValue({ id: 'invite-1', status: 'PENDING' });
    prisma.serverMember.findUnique.mockResolvedValue(null);
    await expect(service.inviteMember('server-1', 'owner-1', 'member-2')).resolves.toEqual({
      id: 'invite-1', status: 'PENDING',
    });
    expect(redis.publish).toHaveBeenCalledWith('chat:events', { type: 'NOTIFY', userId: 'member-2' });

    prisma.serverInvitation.findMany.mockResolvedValue([{
      id: 'invite-1', createdAt: now, server, inviter: member.user,
    }]);
    await expect(service.listIncomingInvitations('member-2')).resolves.toEqual([expect.objectContaining({
      id: 'invite-1', createdAt: now.toISOString(), server: expect.objectContaining({ id: 'server-1' }),
    })]);
  });

  it('rejects invalid invite targets and handles decline ownership', async () => {
    const missing = makeService();
    missing.prisma.user.findUnique.mockResolvedValue(null);
    await expect(missing.service.inviteMember('server-1', 'owner-1', 'missing')).rejects.toBeInstanceOf(NotFoundException);

    const self = makeService();
    await expect(self.service.inviteMember('server-1', 'owner-1', 'owner-1')).rejects.toBeInstanceOf(BadRequestException);

    const existing = makeService();
    existing.prisma.serverMember.findUnique.mockResolvedValue(member);
    await expect(existing.service.inviteMember('server-1', 'owner-1', 'member-1')).rejects.toBeInstanceOf(BadRequestException);

    const decline = makeService();
    decline.prisma.serverInvitation.findUnique.mockResolvedValue({ id: 'invite-1', inviteeId: 'member-1' });
    await expect(decline.service.declineInvitation('invite-1', 'member-1')).resolves.toEqual({ success: true });
    decline.prisma.serverInvitation.findUnique.mockResolvedValue({ id: 'invite-1', inviteeId: 'other' });
    await expect(decline.service.declineInvitation('invite-1', 'member-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('accepts a pending invitation and broadcasts the new member', async () => {
    const { service, prisma, redis } = makeService();
    prisma.serverInvitation.findUnique.mockResolvedValue({
      id: 'invite-1', inviteeId: 'member-1', serverId: 'server-1', status: 'PENDING',
    });
    prisma.server.findUnique.mockResolvedValue({ ...server, ownerId: 'owner-1' });
    prisma.serverMember.findUnique.mockResolvedValue(member);

    await expect(service.acceptInvitation('invite-1', 'member-1')).resolves.toMatchObject({ id: 'server-1' });
    expect(prisma.serverMember.upsert).toHaveBeenCalled();
    expect(redis.publish).toHaveBeenCalledWith('chat:events', expect.objectContaining({ type: 'MEMBER_JOINED' }));

    prisma.serverInvitation.findUnique.mockResolvedValue({
      id: 'invite-1', inviteeId: 'member-1', status: 'DECLINED',
    });
    await expect(service.acceptInvitation('invite-1', 'member-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reorders valid channels and protects deletion scope and the primary channel', async () => {
    const { service, prisma, redis, auditLog } = makeService();
    prisma.channel.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    await service.reorderChannels('server-1', 'owner-1', ['b', 'invalid', 'a']);
    expect(prisma.channel.update).toHaveBeenCalledWith({ where: { id: 'b' }, data: { position: 0 } });
    expect(prisma.channel.update).toHaveBeenCalledWith({ where: { id: 'a' }, data: { position: 1 } });

    prisma.channel.findUnique.mockResolvedValue({ serverId: 'server-1', isDefault: false });
    await expect(service.deleteChannel('server-1', 'channel-1', 'owner-1')).resolves.toEqual({ success: true });
    expect(auditLog.write).toHaveBeenCalledWith(expect.objectContaining({ action: 'CHANNEL_DELETE' }));
    expect(redis.publish).toHaveBeenCalledWith('chat:events', expect.objectContaining({ type: 'CHANNEL_DELETED' }));

    prisma.channel.findUnique.mockResolvedValue({ serverId: 'server-1', isDefault: true });
    await expect(service.deleteChannel('server-1', 'channel-1', 'owner-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('kicks only non-owner peers and publishes the removal', async () => {
    const { service, prisma, redis } = makeService();
    await expect(service.kickMember('server-1', 'member-1', 'owner-1')).resolves.toEqual({ success: true });
    expect(redis.publish).toHaveBeenCalledWith('chat:events', {
      type: 'MEMBER_KICKED', serverId: 'server-1', userId: 'member-1',
    });
    await expect(service.kickMember('server-1', 'owner-1', 'owner-1')).rejects.toBeInstanceOf(ForbiddenException);

    prisma.server.findUnique.mockResolvedValue({ ownerId: 'someone-else' });
    prisma.serverMember.findUnique.mockResolvedValue({ roles: [{ permissions: Permission.MANAGE_MEMBERS }] });
    await expect(service.kickMember('server-1', 'owner-1', 'owner-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updates and owner-deletes servers with audit and realtime events', async () => {
    const { service, prisma, redis, auditLog } = makeService();
    prisma.server.update.mockResolvedValue({ ...server, name: 'Renamed', iconUrl: null });
    await service.updateServer('server-1', 'owner-1', { name: ' Renamed ', iconUrl: '' });
    expect(prisma.server.update).toHaveBeenCalledWith({
      where: { id: 'server-1' }, data: { name: 'Renamed', iconUrl: null },
    });
    expect(auditLog.write).toHaveBeenCalledWith(expect.objectContaining({ action: 'SERVER_UPDATE' }));
    expect(redis.publish).toHaveBeenCalledWith('chat:events', expect.objectContaining({ type: 'SERVER_UPDATED' }));

    await expect(service.deleteServer('server-1', 'owner-1')).resolves.toEqual({ success: true });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Array));
    expect(redis.publish).toHaveBeenCalledWith('chat:events', { type: 'SERVER_DELETED', serverId: 'server-1' });

    const nonOwner = makeService();
    nonOwner.prisma.server.findUnique.mockResolvedValue({ ownerId: 'other' });
    await expect(nonOwner.service.deleteServer('server-1', 'member-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('sets, caps, clears, and enforces member timeouts', async () => {
    jest.useFakeTimers().setSystemTime(now);
    const { service, prisma } = makeService();
    prisma.serverMember.findUnique.mockResolvedValue({ timedOutUntil: null, roles: [role] });

    const beyondCap = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
    const result = await service.setTimeout('server-1', 'member-1', beyondCap, 'owner-1');
    expect(result.timedOutUntil).toBe(new Date(now.getTime() + 28 * 24 * 60 * 60 * 1000).toISOString());
    await expect(service.setTimeout('server-1', 'member-1', new Date(now.getTime() - 1), 'owner-1'))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.clearTimeout('server-1', 'member-1', 'owner-1')).resolves.toEqual({ success: true });

    prisma.serverMember.findUnique.mockResolvedValue({ timedOutUntil: new Date(now.getTime() + 1000) });
    await expect(service.assertNotTimedOut('server-1', 'member-1')).rejects.toBeInstanceOf(ForbiddenException);
    prisma.serverMember.findUnique.mockResolvedValue({ timedOutUntil: new Date(now.getTime() - 1000) });
    await expect(service.assertNotTimedOut('server-1', 'member-1')).resolves.toBeUndefined();
    jest.useRealTimers();
  });

  it('lists, creates, clamps, and removes bans', async () => {
    jest.useFakeTimers().setSystemTime(now);
    const { service, prisma, redis } = makeService();
    const ban = {
      id: 'ban-1', userId: 'member-1', serverId: 'server-1', reason: 'spam',
      createdById: 'owner-1', deleteMessageDays: 7, createdAt: now,
      user: member.user, createdBy: { id: 'owner-1', username: 'owner' },
    };
    prisma.ban.findMany.mockResolvedValue([ban]);
    await expect(service.listBans('server-1', 'owner-1')).resolves.toEqual([{ ...ban, createdAt: now.toISOString() }]);

    prisma.ban.findUnique.mockResolvedValue(null);
    prisma.ban.create.mockResolvedValue(ban);
    await expect(service.banMember('server-1', 'member-1', 'owner-1', {
      reason: 'spam', deleteMessageDays: 99,
    })).resolves.toEqual({ ...ban, createdAt: now.toISOString() });
    expect(prisma.message.updateMany).toHaveBeenCalled();
    expect(redis.publish).toHaveBeenCalledWith('chat:events', expect.objectContaining({ type: 'MEMBER_KICKED' }));

    prisma.ban.findUnique.mockResolvedValue(ban);
    await expect(service.unbanMember('server-1', 'member-1', 'owner-1')).resolves.toEqual({ success: true });
    const missing = makeService();
    await expect(missing.service.unbanMember('server-1', 'member-1', 'owner-1')).rejects.toBeInstanceOf(NotFoundException);
    jest.useRealTimers();
  });

  it('rejects banning the owner, self, and duplicate targets', async () => {
    const ownerTarget = makeService();
    await expect(ownerTarget.service.banMember('server-1', 'owner-1', 'owner-1', {}))
      .rejects.toBeInstanceOf(ForbiddenException);
    const self = makeService();
    self.prisma.server.findUnique.mockResolvedValue({ ownerId: 'other' });
    self.prisma.serverMember.findUnique.mockResolvedValue({ roles: [{ permissions: Permission.BAN_MEMBERS }] });
    await expect(self.service.banMember('server-1', 'actor-1', 'actor-1', {}))
      .rejects.toBeInstanceOf(BadRequestException);
    const duplicate = makeService();
    duplicate.prisma.ban.findUnique.mockResolvedValue({ id: 'ban-1' });
    await expect(duplicate.service.banMember('server-1', 'member-1', 'owner-1', {}))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows non-owners to leave and rejects owner departure', async () => {
    const { service, prisma, redis, auditLog } = makeService();
    await expect(service.leave('server-1', 'member-1')).resolves.toEqual({ success: true });
    expect(auditLog.write).toHaveBeenCalledWith(expect.objectContaining({ action: 'MEMBER_LEAVE' }));
    expect(redis.publish).toHaveBeenCalledWith('chat:events', {
      type: 'MEMBER_LEFT', serverId: 'server-1', userId: 'member-1',
    });
    prisma.server.findUnique.mockResolvedValue({ ownerId: 'member-1' });
    await expect(service.leave('server-1', 'member-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('delegates overwrite CRUD and resolves channel-specific effective permissions', async () => {
    const { service, prisma, overwrites } = makeService();
    overwrites.list.mockResolvedValue([{ id: 'ow-1' }]);
    overwrites.upsert.mockResolvedValue({ id: 'ow-1' });
    overwrites.delete.mockResolvedValue({ success: true });
    await expect(service.listOverwrites('server-1', 'channel-1', 'member-1')).resolves.toEqual([{ id: 'ow-1' }]);
    await service.upsertOverwrite('server-1', 'channel-1', 'member-1', {
      targetType: 'ROLE', targetId: 'role-1', allow: '512',
    });
    await service.deleteOverwrite('server-1', 'channel-1', 'ow-1', 'member-1');

    prisma.server.findUnique.mockResolvedValue({ ownerId: 'owner-1' });
    prisma.serverMember.findUnique.mockResolvedValue({ roles: [
      { id: 'everyone', name: '@everyone', permissions: DEFAULT_MEMBER_PERMISSIONS },
      { id: 'role-1', name: 'Moderator', permissions: Permission.MANAGE_CHANNELS },
    ] });
    prisma.role.findFirst.mockResolvedValue({ permissions: DEFAULT_MEMBER_PERMISSIONS });
    prisma.channelOverwrite.findMany.mockResolvedValue([{
      targetType: 'MEMBER', targetId: 'member-1', allow: Permission.MANAGE_ROLES, deny: Permission.SEND_MESSAGES,
    }]);
    const result = await service.getChannelPermissions('server-1', 'channel-1', 'member-1');
    expect(result & Permission.MANAGE_ROLES).not.toBe(0n);
    expect(result & Permission.SEND_MESSAGES).toBe(0n);
  });

  it('rejects server mutation when required permission is absent', async () => {
    const { service, prisma } = makeService();
    prisma.server.findUnique.mockResolvedValue({ ownerId: 'owner-1' });
    prisma.serverMember.findUnique.mockResolvedValue({ roles: [{ permissions: Permission.READ_MESSAGES }] });
    await expect(service.createChannel('server-1', 'member-1', { name: 'nope', type: ChannelType.TEXT }))
      .rejects.toBeInstanceOf(ForbiddenException);
  });
});
