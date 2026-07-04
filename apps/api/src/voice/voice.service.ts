import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class VoiceService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Assert the user may access the channel (server member or DM recipient); returns the channel. */
  private async assertAccess(channelId: string, userId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { id: true, serverId: true, type: true, name: true },
    });
    if (!channel) throw new NotFoundException('Channel not found');
    if (channel.serverId) {
      const member = await this.prisma.serverMember.findUnique({
        where: { serverId_userId: { serverId: channel.serverId, userId } },
      });
      if (!member) throw new ForbiddenException('Not a member of this server');
    } else {
      const recipient = await this.prisma.channelRecipient.findUnique({
        where: { channelId_userId: { channelId, userId } },
      });
      if (!recipient) throw new ForbiddenException('Not a participant of this DM');
    }
    return channel;
  }

  /** Mint a LiveKit access token for the channel's room and record a voice session. */
  async join(channelId: string, userId: string) {
    const channel = await this.assertAccess(channelId, userId);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    // Close any stale open sessions for this user+channel, then open a fresh one.
    await this.prisma.voiceSession.updateMany({
      where: { channelId, userId, leftAt: null },
      data: { leftAt: new Date() },
    });
    await this.prisma.voiceSession.create({ data: { channelId, userId } });

    // DM call: ring the other participant(s) who aren't already connected.
    if (!channel.serverId) {
      const recips = await this.prisma.channelRecipient.findMany({
        where: { channelId },
        select: { userId: true },
      });
      const others = recips.map((r) => r.userId).filter((id) => id !== userId);
      if (others.length) {
        const active = await this.prisma.voiceSession.findMany({
          where: { channelId, leftAt: null, userId: { in: others } },
          select: { userId: true },
        });
        const activeSet = new Set(active.map((a) => a.userId));
        const callerName = user?.displayName || user?.username || 'Someone';
        for (const uid of others) {
          if (activeSet.has(uid)) continue;
          await this.redis.publish('chat:events', {
            type: 'CALL_RING',
            userId: uid,
            channelId,
            callerId: userId,
            callerName,
            callerAvatar: user?.avatarUrl ?? null,
          });
        }
      }
    }

    const at = new AccessToken(
      this.config.getOrThrow<string>('LIVEKIT_API_KEY'),
      this.config.getOrThrow<string>('LIVEKIT_API_SECRET'),
      { identity: userId, name: user?.displayName || user?.username || 'user' },
    );
    at.addGrant({ roomJoin: true, room: channelId, canPublish: true, canSubscribe: true });
    const token = await at.toJwt();

    return { url: this.config.getOrThrow<string>('LIVEKIT_URL'), token, room: channelId };
  }

  async leave(channelId: string, userId: string) {
    await this.prisma.voiceSession.updateMany({
      where: { channelId, userId, leftAt: null },
      data: { leftAt: new Date() },
    });
    return { success: true };
  }

  /** HTTP client for LiveKit's server API (used to read the room's live roster). */
  private roomClient(): RoomServiceClient | null {
    const url = this.config.get<string>('LIVEKIT_API_URL');
    if (!url) return null;
    return new RoomServiceClient(
      url,
      this.config.getOrThrow<string>('LIVEKIT_API_KEY'),
      this.config.getOrThrow<string>('LIVEKIT_API_SECRET'),
    );
  }

  /**
   * Who is currently connected to the channel's voice room. When the LiveKit API is
   * configured we use its live roster as the source of truth (and self-heal stale DB
   * sessions), so ghosts from tab-closes / drops / SFU restarts can't linger. Falls back
   * to the DB session table if the LiveKit API is unset or unreachable.
   */
  async participants(channelId: string, userId: string) {
    await this.assertAccess(channelId, userId);

    const client = this.roomClient();
    if (client) {
      try {
        let live: { identity: string }[] = [];
        try {
          live = await client.listParticipants(channelId);
        } catch (err: any) {
          // "room does not exist" simply means nobody is connected.
          if (!/not.?found|does not exist/i.test(String(err?.message ?? err))) throw err;
        }
        const liveIds = [...new Set(live.map((p) => p.identity))];
        // Self-heal: close any DB session for someone LiveKit says isn't actually here.
        await this.prisma.voiceSession.updateMany({
          where: { channelId, leftAt: null, ...(liveIds.length ? { userId: { notIn: liveIds } } : {}) },
          data: { leftAt: new Date() },
        });
        if (!liveIds.length) return [];
        const users = await this.prisma.user.findMany({
          where: { id: { in: liveIds } },
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        });
        const byId = new Map(users.map((u) => [u.id, u]));
        return liveIds.map((id) => byId.get(id)).filter((u): u is (typeof users)[number] => !!u);
      } catch {
        // LiveKit API unreachable — fall through to DB session tracking.
      }
    }

    const sessions = await this.prisma.voiceSession.findMany({
      where: { channelId, leftAt: null },
      include: { user: true },
      orderBy: { joinedAt: 'asc' },
    });
    const seen = new Set<string>();
    const users: { id: string; username: string; displayName: string | null; avatarUrl: string | null }[] = [];
    for (const s of sessions) {
      if (seen.has(s.userId)) continue;
      seen.add(s.userId);
      users.push({ id: s.user.id, username: s.user.username, displayName: s.user.displayName, avatarUrl: s.user.avatarUrl });
    }
    return users;
  }
}
