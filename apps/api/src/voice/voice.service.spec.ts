import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { VoiceService } from './voice.service';

jest.mock('livekit-server-sdk', () => ({
  AccessToken: jest.fn(),
  RoomServiceClient: jest.fn(),
}));

describe('VoiceService', () => {
  const AccessTokenMock = AccessToken as unknown as jest.Mock;
  const RoomServiceClientMock = RoomServiceClient as unknown as jest.Mock;
  let token: { addGrant: jest.Mock; toJwt: jest.Mock };
  let roomClient: { listParticipants: jest.Mock };

  function makeService(options: { channel?: any; member?: any; recipient?: any; apiUrl?: string } = {}) {
    const values: Record<string, string | undefined> = {
      LIVEKIT_API_KEY: 'livekit-key',
      LIVEKIT_API_SECRET: 'livekit-secret',
      LIVEKIT_URL: 'wss://voice.example.test',
      LIVEKIT_API_URL: options.apiUrl,
    };
    const config = {
      get: jest.fn((key: string) => values[key]),
      getOrThrow: jest.fn((key: string) => {
        if (!values[key]) throw new Error(`Missing ${key}`);
        return values[key];
      }),
    } as unknown as ConfigService;
    const prisma = {
      channel: {
        findUnique: jest.fn().mockResolvedValue(options.channel === undefined
          ? { id: 'channel-1', serverId: 'server-1', type: 'VOICE', name: 'General' }
          : options.channel),
      },
      serverMember: {
        findUnique: jest.fn().mockResolvedValue(options.member === undefined ? { id: 'member-1' } : options.member),
      },
      channelRecipient: {
        findUnique: jest.fn().mockResolvedValue(options.recipient === undefined ? { userId: 'user-1' } : options.recipient),
        findMany: jest.fn().mockResolvedValue([]),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1', username: 'caller', displayName: 'Caller Name', avatarUrl: '/avatar.png',
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      voiceSession: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({ id: 'session-1' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as any;
    const redis = { publish: jest.fn().mockResolvedValue(1) } as any;
    return { service: new VoiceService(config, prisma, redis), config, prisma, redis };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    token = { addGrant: jest.fn(), toJwt: jest.fn().mockResolvedValue('signed-token') };
    roomClient = { listParticipants: jest.fn().mockResolvedValue([]) };
    AccessTokenMock.mockImplementation(() => token);
    RoomServiceClientMock.mockImplementation(() => roomClient);
  });

  it('rejects missing channels and users outside server or DM membership', async () => {
    await expect(makeService({ channel: null }).service.join('missing', 'user-1'))
      .rejects.toBeInstanceOf(NotFoundException);
    await expect(makeService({ member: null }).service.join('channel-1', 'user-1'))
      .rejects.toBeInstanceOf(ForbiddenException);
    await expect(makeService({ channel: { id: 'dm-1', serverId: null }, recipient: null }).service.join('dm-1', 'user-1'))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('replaces stale sessions, publishes occupancy, and returns a scoped LiveKit token', async () => {
    const { service, prisma, redis } = makeService();

    await expect(service.join('channel-1', 'user-1')).resolves.toEqual({
      url: 'wss://voice.example.test', token: 'signed-token', room: 'channel-1',
    });

    expect(prisma.voiceSession.updateMany).toHaveBeenCalledWith({
      where: { channelId: 'channel-1', userId: 'user-1', leftAt: null },
      data: { leftAt: expect.any(Date) },
    });
    expect(prisma.voiceSession.create).toHaveBeenCalledWith({ data: { channelId: 'channel-1', userId: 'user-1' } });
    expect(redis.publish).toHaveBeenCalledWith('chat:events', {
      type: 'VOICE_OCCUPANCY_CHANGED', channelId: 'channel-1', serverId: 'server-1',
    });
    expect(AccessTokenMock).toHaveBeenCalledWith('livekit-key', 'livekit-secret', {
      identity: 'user-1', name: 'Caller Name',
    });
    expect(token.addGrant).toHaveBeenCalledWith({
      roomJoin: true, room: 'channel-1', canPublish: true, canSubscribe: true,
    });
  });

  it('rings only disconnected DM recipients with caller metadata', async () => {
    const { service, prisma, redis } = makeService({ channel: { id: 'dm-1', serverId: null } });
    prisma.channelRecipient.findMany.mockResolvedValue([
      { userId: 'user-1' }, { userId: 'user-2' }, { userId: 'user-3' },
    ]);
    prisma.voiceSession.findMany.mockResolvedValue([{ userId: 'user-2' }]);

    await service.join('dm-1', 'user-1');

    expect(redis.publish).toHaveBeenCalledWith('chat:events', {
      type: 'CALL_RING', userId: 'user-3', channelId: 'dm-1', callerId: 'user-1',
      callerName: 'Caller Name', callerAvatar: '/avatar.png',
    });
    expect(redis.publish).not.toHaveBeenCalledWith('chat:events', expect.objectContaining({
      type: 'CALL_RING', userId: 'user-2',
    }));
  });

  it('closes sessions on leave and only announces channels that still exist', async () => {
    const existing = makeService();
    await expect(existing.service.leave('channel-1', 'user-1')).resolves.toEqual({ success: true });
    expect(existing.redis.publish).toHaveBeenCalledWith('chat:events', {
      type: 'VOICE_OCCUPANCY_CHANGED', channelId: 'channel-1', serverId: 'server-1',
    });

    const deleted = makeService();
    deleted.prisma.channel.findUnique.mockResolvedValue(null);
    await deleted.service.leave('deleted-channel', 'user-1');
    expect(deleted.redis.publish).not.toHaveBeenCalled();
  });

  it('uses the LiveKit roster as source of truth, preserving order and healing ghosts', async () => {
    const { service, prisma } = makeService({ apiUrl: 'http://livekit-api:7880' });
    roomClient.listParticipants.mockResolvedValue([
      { identity: 'user-2' }, { identity: 'user-1' }, { identity: 'user-2' },
    ]);
    prisma.user.findMany.mockResolvedValue([
      { id: 'user-1', username: 'one', displayName: null, avatarUrl: null },
      { id: 'user-2', username: 'two', displayName: 'Two', avatarUrl: '/two.png' },
    ]);

    await expect(service.participants('channel-1', 'user-1')).resolves.toEqual([
      { id: 'user-2', username: 'two', displayName: 'Two', avatarUrl: '/two.png' },
      { id: 'user-1', username: 'one', displayName: null, avatarUrl: null },
    ]);
    expect(RoomServiceClientMock).toHaveBeenCalledWith('http://livekit-api:7880', 'livekit-key', 'livekit-secret');
    expect(prisma.voiceSession.updateMany).toHaveBeenCalledWith({
      where: { channelId: 'channel-1', leftAt: null, userId: { notIn: ['user-2', 'user-1'] } },
      data: { leftAt: expect.any(Date) },
    });
  });

  it('treats a missing LiveKit room as empty and closes every stale session', async () => {
    const { service, prisma } = makeService({ apiUrl: 'http://livekit-api:7880' });
    roomClient.listParticipants.mockRejectedValue(new Error('room does not exist'));

    await expect(service.participants('channel-1', 'user-1')).resolves.toEqual([]);
    expect(prisma.voiceSession.updateMany).toHaveBeenCalledWith({
      where: { channelId: 'channel-1', leftAt: null }, data: { leftAt: expect.any(Date) },
    });
    expect(prisma.voiceSession.findMany).not.toHaveBeenCalled();
  });

  it('falls back to ordered, de-duplicated database sessions when LiveKit is unreachable', async () => {
    const { service, prisma } = makeService({ apiUrl: 'http://livekit-api:7880' });
    roomClient.listParticipants.mockRejectedValue(new Error('ECONNREFUSED'));
    prisma.voiceSession.findMany.mockResolvedValue([
      { userId: 'user-2', user: { id: 'user-2', username: 'two', displayName: null, avatarUrl: null } },
      { userId: 'user-2', user: { id: 'user-2', username: 'two', displayName: null, avatarUrl: null } },
      { userId: 'user-3', user: { id: 'user-3', username: 'three', displayName: 'Three', avatarUrl: '/3.png' } },
    ]);

    await expect(service.participants('channel-1', 'user-1')).resolves.toEqual([
      { id: 'user-2', username: 'two', displayName: null, avatarUrl: null },
      { id: 'user-3', username: 'three', displayName: 'Three', avatarUrl: '/3.png' },
    ]);
  });
});
