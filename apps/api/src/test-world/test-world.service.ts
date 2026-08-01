import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { TokenService } from '../auth/token.service';
import { ChannelType } from '@prisma/client';

interface TestWorldFixtures {
  serverId: string;
  serverName: string;
  channels: { general: string; random: string; voice: string };
  friend: { userId: string; username: string };
  dmChannelId: string;
  messageIds: string[];
}

export interface TestWorld {
  username: string;
  userId: string;
  tokens: {
    accessToken: string;
    expiresIn: number;
    refreshToken: string;
  };
  fixtures: TestWorldFixtures;
}

@Injectable()
export class TestWorldService {
  private readonly logger = new Logger(TestWorldService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly tokenService: TokenService,
  ) {}

  /**
   * Provision a fresh, isolated test world.
   *
   * @satisfies idempotent-by-construction — every call creates NEW users with
   *   time+random usernames, so no two calls share state.
   * @satisfies collision-proof — username/server names embed Date.now() + random
   *   hex so 4 parallel devices never collide.
   */
  async provision(label?: string): Promise<TestWorld> {
    const suffix = `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
    const primaryUsername = `tw-${label ? `${label.slice(0, 24)}-` : ''}${suffix}`;
    const friendUsername = `tw-friend-${suffix}`;
    const serverName = `TW ${label ? `${label.slice(0, 24)} ` : ''}${suffix}`;

    // ── Users ──
    const primaryUser = await this.authService.devLogin(primaryUsername);
    const friendUser = await this.authService.devLogin(friendUsername);

    // ── Tokens ──
    const tokens = await this.tokenService.issueFamily(primaryUser.id);

    // ── Server ──
    const server = await this.prisma.server.create({
      data: {
        name: serverName,
        ownerId: primaryUser.id,
      },
    });

    // ── Server member (owner) ──
    await this.prisma.serverMember.create({
      data: { serverId: server.id, userId: primaryUser.id },
    });

    // ── Server member (friend — needed for kick/member-list E2E flows) ──
    await this.prisma.serverMember.create({
      data: { serverId: server.id, userId: friendUser.id },
    });

    // ── Channels ──
    const general = await this.prisma.channel.create({
      data: { name: 'general', type: ChannelType.TEXT, serverId: server.id, position: 0, isDefault: true },
    });
    const random = await this.prisma.channel.create({
      data: { name: 'random', type: ChannelType.TEXT, serverId: server.id, position: 1 },
    });
    const voice = await this.prisma.channel.create({
      data: { name: 'voice', type: ChannelType.VOICE, serverId: server.id, position: 2 },
    });

    // ── Friendship ──
    await this.prisma.friendship.create({
      data: {
        requesterId: primaryUser.id,
        addresseeId: friendUser.id,
        status: 'ACCEPTED',
      },
    });

    // ── DM channel ──
    const dmChannel = await this.prisma.channel.create({
      data: {
        name: `${primaryUsername} / ${friendUsername}`,
        type: ChannelType.DM,
      },
    });
    await this.prisma.channelRecipient.createMany({
      data: [
        { channelId: dmChannel.id, userId: primaryUser.id },
        { channelId: dmChannel.id, userId: friendUser.id },
      ],
    });

    // ── Seed messages in #general ──
    const messageIds: string[] = [];
    const seedMessages = [
      `Welcome to the test world${label ? `: ${label}` : ''}!`,
      'This is a freshly provisioned server.',
      'All test state is isolated — run with confidence.',
    ];
    for (const content of seedMessages) {
      const msg = await this.prisma.message.create({
        data: {
          channelId: general.id,
          authorId: primaryUser.id,
          content,
        },
      });
      messageIds.push(msg.id);
    }

    this.logger.log(`Provisioned test world for ${primaryUsername} (server=${server.id})`);

    return {
      username: primaryUsername,
      userId: primaryUser.id,
      tokens,
      fixtures: {
        serverId: server.id,
        serverName: server.name,
        channels: {
          general: general.id,
          random: random.id,
          voice: voice.id,
        },
        friend: {
          userId: friendUser.id,
          username: friendUsername,
        },
        dmChannelId: dmChannel.id,
        messageIds,
      },
    };
  }
}
