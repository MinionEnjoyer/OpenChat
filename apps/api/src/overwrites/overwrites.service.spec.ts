import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Permission } from '../permissions/permissions';
import { OverwritesService } from './overwrites.service';

describe('OverwritesService', () => {
  function makeService(permissions: bigint = Permission.MANAGE_CHANNELS) {
    const prisma = {
      channel: { findUnique: jest.fn().mockResolvedValue({ serverId: 'server-1' }) },
      channelOverwrite: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({
          id: 'overwrite-1', channelId: 'channel-1', targetType: 'ROLE',
          targetId: 'role-1', allow: 4n, deny: 8n,
        }),
        delete: jest.fn().mockResolvedValue({}),
      },
      role: { findUnique: jest.fn().mockResolvedValue({ id: 'role-1', serverId: 'server-1' }) },
      serverMember: { findUnique: jest.fn().mockResolvedValue({ id: 'member-1' }) },
    } as any;
    const servers = {
      get: jest.fn().mockResolvedValue({ id: 'server-1' }),
      getMemberPermissions: jest.fn().mockResolvedValue(permissions),
    } as any;
    return { service: new OverwritesService(prisma, servers), prisma, servers };
  }

  it('lists only overwrites from a channel in the requested server', async () => {
    const { service, prisma, servers } = makeService();
    prisma.channelOverwrite.findMany.mockResolvedValue([{
      id: 'overwrite-1', channelId: 'channel-1', targetType: 'MEMBER',
      targetId: 'member-1', allow: 512n, deny: 1024n,
    }]);

    await expect(service.list('server-1', 'channel-1', 'user-1')).resolves.toEqual([{
      id: 'overwrite-1', channelId: 'channel-1', targetType: 'MEMBER',
      targetId: 'member-1', allow: '512', deny: '1024',
    }]);
    expect(servers.get).toHaveBeenCalledWith('server-1', 'user-1');
    expect(prisma.channelOverwrite.findMany).toHaveBeenCalledWith({ where: { channelId: 'channel-1' } });
  });

  it('hides missing and cross-server channels before membership lookup', async () => {
    for (const channel of [null, { serverId: 'other-server' }]) {
      const { service, prisma, servers } = makeService();
      prisma.channel.findUnique.mockResolvedValue(channel);
      await expect(service.list('server-1', 'channel-1', 'user-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(servers.get).not.toHaveBeenCalled();
    }
  });

  it.each([
    Permission.MANAGE_CHANNELS,
    Permission.MANAGE_ROLES,
    Permission.ADMINISTRATOR,
  ])('allows overwrite management with permission bit %s', async (permissions) => {
    const { service, prisma } = makeService(permissions);
    await service.upsert('server-1', 'channel-1', 'user-1', {
      targetType: 'ROLE', targetId: 'role-1', allow: '4', deny: '8',
    });
    expect(prisma.channelOverwrite.upsert).toHaveBeenCalled();
  });

  it('rejects users without a management permission before target lookup', async () => {
    const { service, prisma } = makeService(Permission.SEND_MESSAGES);
    await expect(service.upsert('server-1', 'channel-1', 'user-1', {
      targetType: 'ROLE', targetId: 'role-1',
    })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.channel.findUnique).not.toHaveBeenCalled();
  });

  it('rejects cross-server channels, roles, and absent members', async () => {
    const channel = makeService();
    channel.prisma.channel.findUnique.mockResolvedValue({ serverId: 'other-server' });
    await expect(channel.service.upsert('server-1', 'channel-1', 'user-1', {
      targetType: 'ROLE', targetId: 'role-1',
    })).rejects.toBeInstanceOf(NotFoundException);

    const role = makeService();
    role.prisma.role.findUnique.mockResolvedValue({ id: 'role-1', serverId: 'other-server' });
    await expect(role.service.upsert('server-1', 'channel-1', 'user-1', {
      targetType: 'ROLE', targetId: 'role-1',
    })).rejects.toMatchObject({ response: expect.objectContaining({ message: 'Role not found in this server' }) });

    const member = makeService();
    member.prisma.serverMember.findUnique.mockResolvedValue(null);
    await expect(member.service.upsert('server-1', 'channel-1', 'user-1', {
      targetType: 'MEMBER', targetId: 'missing-user',
    })).rejects.toMatchObject({ response: expect.objectContaining({ message: 'Member not found in this server' }) });
  });

  it('sanitizes decimal bitfields, defaults omitted values, and serializes BigInts', async () => {
    const explicit = makeService();
    await expect(explicit.service.upsert('server-1', 'channel-1', 'user-1', {
      targetType: 'ROLE', targetId: 'role-1', allow: '4', deny: '8',
    })).resolves.toEqual({
      id: 'overwrite-1', channelId: 'channel-1', targetType: 'ROLE',
      targetId: 'role-1', allow: '4', deny: '8',
    });
    expect(explicit.prisma.channelOverwrite.upsert).toHaveBeenCalledWith({
      where: { channelId_targetType_targetId: { channelId: 'channel-1', targetType: 'ROLE', targetId: 'role-1' } },
      create: {
        channelId: 'channel-1', targetType: 'ROLE', targetId: 'role-1', allow: 4n, deny: 8n,
      },
      update: { allow: 4n, deny: 8n },
    });

    const defaults = makeService();
    await defaults.service.upsert('server-1', 'channel-1', 'user-1', {
      targetType: 'ROLE', targetId: 'role-1',
    });
    expect(defaults.prisma.channelOverwrite.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ allow: 0n, deny: 0n }), update: { allow: 0n, deny: 0n },
    }));
  });

  it('rejects malformed permission bitfields without writing an overwrite', async () => {
    const { service, prisma } = makeService();
    await expect(service.upsert('server-1', 'channel-1', 'user-1', {
      targetType: 'ROLE', targetId: 'role-1', allow: 'not-a-number',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.channelOverwrite.upsert).not.toHaveBeenCalled();
  });

  it('deletes only the exact overwrite belonging to the requested channel and server', async () => {
    const missing = makeService();
    await expect(missing.service.delete('server-1', 'channel-1', 'missing', 'user-1'))
      .rejects.toBeInstanceOf(NotFoundException);

    for (const overwrite of [
      { id: 'overwrite-1', channelId: 'channel-1', channel: { serverId: 'other-server' } },
      { id: 'overwrite-1', channelId: 'other-channel', channel: { serverId: 'server-1' } },
    ]) {
      const scoped = makeService();
      scoped.prisma.channelOverwrite.findUnique.mockResolvedValue(overwrite);
      await expect(scoped.service.delete('server-1', 'channel-1', 'overwrite-1', 'user-1'))
        .rejects.toBeInstanceOf(NotFoundException);
    }

    const valid = makeService();
    valid.prisma.channelOverwrite.findUnique.mockResolvedValue({
      id: 'overwrite-1', channelId: 'channel-1', channel: { serverId: 'server-1' },
    });
    await expect(valid.service.delete('server-1', 'channel-1', 'overwrite-1', 'user-1'))
      .resolves.toEqual({ success: true });
    expect(valid.prisma.channelOverwrite.delete).toHaveBeenCalledWith({ where: { id: 'overwrite-1' } });
  });
});
