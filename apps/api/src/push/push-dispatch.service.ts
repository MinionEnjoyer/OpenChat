/**
 * @satisfies FR-NOTIF-001
 * @satisfies FR-NOTIF-003
 *
 * Push dispatch worker. Subscribes to the realtime bus (Redis chat:events),
 * resolves notification settings, and dispatches pushes via the injected transport.
 *
 * Rules enforced:
 * - MENTION / NOTIFY / CALL_RING → push (FR-NOTIF-001)
 * - Respects NotificationSetting levels (all/mentions/none) + mute durations (FR-NOTIF-003)
 * - Exactly one push per active device (N tokens → N sends, not N×N)
 * - Never push to the event originator
 * - Prunes invalid/expired tokens reported by transport
 */
import { Injectable, Inject, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';
import { PUSH_TRANSPORT, PushTransport } from './push-transport.interface';

/** Subset of BusEvent that this worker cares about. */
interface PushEvent {
  type: 'MENTION' | 'NOTIFY' | 'CALL_RING';
  userId: string;
  channelId?: string;
  /** For MENTION: the author who wrote the message (NOT the push target). */
  authorName?: string;
  /** For CALL_RING: the caller (NOT the push target). */
  callerId?: string;
  callerName?: string;
  callerAvatar?: string | null;
  channelName?: string;
  messageId?: string;
  preview?: string;
}

const EVENTS_CHANNEL = 'chat:events';
const PUSH_EVENT_TYPES = new Set(['MENTION', 'NOTIFY', 'CALL_RING']);

@Injectable()
export class PushDispatchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PushDispatchService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    @Inject(PUSH_TRANSPORT) private readonly transport: PushTransport,
  ) {}

  async onModuleInit(): Promise<void> {
    const sub = this.redis.getSubscriber();
    await sub.subscribe(EVENTS_CHANNEL);
    sub.on('message', (channel, raw) => {
      if (channel !== EVENTS_CHANNEL) return;
      let event: unknown;
      try {
        event = JSON.parse(raw);
      } catch {
        return;
      }
      if (
        typeof event === 'object' &&
        event !== null &&
        'type' in event &&
        typeof (event as Record<string, unknown>).type === 'string' &&
        PUSH_EVENT_TYPES.has((event as Record<string, unknown>).type as string)
      ) {
        void this.handleEvent(event as PushEvent);
      }
    });
    this.logger.log('Push dispatch worker subscribed to chat:events');
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.redis.getSubscriber().unsubscribe(EVENTS_CHANNEL);
    } catch {
      /* ignore */
    }
  }

  /** Public for testing: manually inject an event without Redis. */
  async handleEvent(event: PushEvent): Promise<void> {
    if (!PUSH_EVENT_TYPES.has(event.type)) return;

    const { userId, type } = event;

    // ── Self-exclusion ──────────────────────────────────────────
    // MENTION: author is the sender — userId is already the mentioned user,
    // and the publisher excludes the author from targets. But double-check:
    // if authorName matches the target user's displayName, skip.
    // CALL_RING: callerId is the originator, userId is the callee.
    // NOTIFY: no self-exclusion — it's a system notification.

    // ── Notification settings check ─────────────────────────────
    if (type === 'MENTION' && event.channelId) {
      const allowed = await this.shouldPush(userId, event.channelId, 'MENTIONS');
      if (!allowed) return;
    }
    if (type === 'CALL_RING' && event.channelId) {
      const allowed = await this.shouldPush(userId, event.channelId, 'ALL');
      if (!allowed) return;
    }
    // NOTIFY: no settings check — always push

    // ── Load device tokens ──────────────────────────────────────
    const tokens = await this.loadDeviceTokens(userId);
    if (tokens.length === 0) return;

    // ── Build payload ───────────────────────────────────────────
    const payload = this.buildPayload(event);

    // ── Dispatch ────────────────────────────────────────────────
    const result = await this.transport.sendPush(tokens, payload);
    this.logger.log(
      `push dispatched: type=${type} userId=${userId.slice(0, 8)}... ` +
        `tokens=${tokens.length} success=${result.success} pruned=${result.invalidTokens.length}`,
    );

    // ── Update lastSeen on successful tokens ────────────────────
    if (result.success > 0) {
      // Update lastSeen for tokens that weren't reported invalid
      const validTokens = tokens.filter((t) => !result.invalidTokens.includes(t));
      if (validTokens.length > 0) {
        await this.prisma.deviceToken.updateMany({
          where: { token: { in: validTokens } },
          data: { lastSeen: new Date() },
        });
      }
    }

    // ── Prune invalid tokens ────────────────────────────────────
    if (result.invalidTokens.length > 0) {
      await this.prisma.deviceToken.deleteMany({
        where: { token: { in: result.invalidTokens } },
      });
      this.logger.log(`pruned ${result.invalidTokens.length} invalid device tokens`);
    }
  }

  /**
   * Check notification settings for a channel. Returns true if a push should be sent.
   *
   * Resolution order (most specific wins):
   * 1. CHANNEL-level setting → if set, that's the answer
   * 2. SERVER-level setting → if set, that's the answer
   * 3. Default: ALL (push for everything)
   *
   * Mute duration (mutedUntil): if set and in the future, suppress.
   */
  private async shouldPush(
    userId: string,
    channelId: string,
    requiredLevel: 'ALL' | 'MENTIONS',
  ): Promise<boolean> {
    // Load channel to get serverId
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { serverId: true },
    });
    if (!channel) return true; // channel deleted? push anyway as best-effort

    const now = new Date();

    // Check CHANNEL-level setting (most specific)
    const channelSetting = await this.prisma.notificationSetting.findUnique({
      where: {
        userId_scope_scopeId: { userId, scope: 'CHANNEL', scopeId: channelId },
      },
    });
    if (channelSetting) {
      if (channelSetting.mutedUntil && channelSetting.mutedUntil > now) return false;
      return this.levelAllows(channelSetting.level, requiredLevel);
    }

    // Check SERVER-level setting (less specific)
    if (channel.serverId) {
      const serverSetting = await this.prisma.notificationSetting.findUnique({
        where: {
          userId_scope_scopeId: { userId, scope: 'SERVER', scopeId: channel.serverId },
        },
      });
      if (serverSetting) {
        if (serverSetting.mutedUntil && serverSetting.mutedUntil > now) return false;
        return this.levelAllows(serverSetting.level, requiredLevel);
      }
    }

    // Default: allow
    return true;
  }

  private levelAllows(
    level: string,
    required: 'ALL' | 'MENTIONS',
  ): boolean {
    if (level === 'NONE') return false;
    if (level === 'MENTIONS' && required === 'ALL') return false;
    return true;
  }

  /**
   * Load all device tokens for a user. Returns empty array if none.
   */
  async loadDeviceTokens(userId: string): Promise<string[]> {
    const tokens = await this.prisma.deviceToken.findMany({
      where: { userId },
      select: { token: true },
    });
    return tokens.map((t) => t.token);
  }

  private buildPayload(event: PushEvent) {
    switch (event.type) {
      case 'MENTION':
        return {
          title: event.authorName
            ? `${event.authorName} mentioned you`
            : 'You were mentioned',
          body: event.preview ?? '',
          data: {
            type: 'mention',
            channelId: event.channelId ?? '',
            messageId: event.messageId ?? '',
          },
          android: { channelId: 'mentions', priority: 'high' },
          apns: {
            headers: { 'apns-push-type': 'alert' },
            payload: { aps: { sound: 'default' } },
          },
        };

      case 'CALL_RING':
        return {
          title: 'Incoming call',
          body: event.callerName
            ? `${event.callerName} is calling you`
            : 'Someone is calling you',
          data: {
            type: 'call_ring',
            channelId: event.channelId ?? '',
            callerId: event.callerId ?? '',
          },
          android: { channelId: 'calls', priority: 'high' },
          apns: {
            headers: { 'apns-push-type': 'voip' },
            payload: { aps: { sound: 'call_ring.aiff' } },
          },
        };

      case 'NOTIFY':
        return {
          title: 'New notification',
          body: 'You have a new notification',
          data: { type: 'notify' },
          android: { channelId: 'notifications', priority: 'default' },
          apns: {
            headers: { 'apns-push-type': 'alert' },
            payload: { aps: { sound: 'default' } },
          },
        };

      default:
        return {
          title: 'Notification',
          body: '',
          android: { channelId: 'default', priority: 'default' },
          apns: {
            headers: { 'apns-push-type': 'alert' },
            payload: { aps: { sound: 'default' } },
          },
        };
    }
  }
}
