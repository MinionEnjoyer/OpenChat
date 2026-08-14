import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { WebSocketServer, WebSocket, RawData } from 'ws';
import type { Server as HttpServer, IncomingMessage } from 'http';
import type { Duplex } from 'stream';
import { RedisService } from '../redis/redis.service';
import { AuthService } from '../auth/auth.service';
import { MessagesService } from '../messages/messages.service';
import { PrismaService } from '../prisma/prisma.service';
import { PresenceService } from './presence.service';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';

const EVENTS_CHANNEL = 'chat:events';
const HEARTBEAT_MS = 30_000;
const CHANNEL_ID = z.string().uuid();

/**
 * WebSocket protocol (path: /ws?ticket=<ws-ticket>). Envelope: { op, d, id? }.
 * PROTOCOL_VERSION is echoed in the `ready` event so clients can detect drift.
 *
 * Client → server ops:  ping, subscribe {channelId}, unsubscribe {channelId},
 *   message.send {channelId, content, nonce?, attachments?, replyToId?},
 *   typing.start {channelId}, presence.update {status, transient?}
 * Server → client ops:  ready {protocolVersion, user, servers}, pong,
 *   message.created {message, nonce?}, message.updated {message},
 *   message.deleted {channelId, id}, typing {channelId, userId},
 *   presence {userId, status}, presence.snapshot {users:[{userId,status}]},
 *   watchparty.sync {channelId, state}, watchparty.left {channelId},
 *   notify, mention {channelId, channelName, authorName}, call.ring {...}
 */
const PROTOCOL_VERSION = 1;

interface Envelope<T = any> {
  op: string;
  d: T;
  id?: string;
}

/** Internal event shape published to Redis by services + this gateway. */
type BusEvent =
  | { type: 'MESSAGE_CREATED'; message: any; nonce?: string }
  | { type: 'MESSAGE_UPDATED'; message: any }
  | { type: 'MESSAGE_DELETED'; id: string; channelId: string }
  | { type: 'TYPING_START'; channelId: string; userId: string }
  | { type: 'PRESENCE_UPDATE'; userId: string; status: string; platforms?: string[] }
  | { type: 'WATCHPARTY_SYNC'; channelId: string; state: any | null; excludedUserIds?: string[] }
  | { type: 'WATCHPARTY_LEFT'; channelId: string; userId: string }
  | { type: 'NOTIFY'; userId: string }
  | { type: 'MENTION'; userId: string; channelId: string; messageId: string; channelName: string; authorName: string; preview: string }
  | { type: 'CALL_RING'; userId: string; channelId: string; callerId: string; callerName: string; callerAvatar: string | null }
  | { type: 'VOICE_OCCUPANCY_CHANGED'; channelId: string; serverId: string | null }
  // ── P3 granular guild-structure events ──
  | { type: 'CHANNEL_CREATED'; serverId: string; channel: any }
  | { type: 'CHANNEL_DELETED'; serverId: string; channelId: string }
  | { type: 'ROLE_CREATED'; serverId: string; role: any }
  | { type: 'ROLE_UPDATED'; serverId: string; role: any }
  | { type: 'ROLE_DELETED'; serverId: string; roleId: string }
  | { type: 'MEMBER_JOINED'; serverId: string; userId: string; member: any }
  | { type: 'MEMBER_LEFT'; serverId: string; userId: string }
  | { type: 'MEMBER_KICKED'; serverId: string; userId: string }
  | { type: 'SERVER_UPDATED'; serverId: string; server: any }
  | { type: 'SERVER_DELETED'; serverId: string; serverId_2?: never }; // serverId is the deleted server

interface Client {
  socket: WebSocket;
  userId: string;
  /** Subscribed channel ID -> owning server ID (null for DMs). */
  channels: Map<string, string | null>;
  /** Server IDs this user belongs to — populated on connect, kept current by MEMBER_JOINED/LEFT events. */
  serverIds: Set<string>;
  alive: boolean;
  /** Which client this socket is: 'desktop' | 'mobile' | 'web'. Drives the presence platform badge. */
  platform: string;
  opWindowStartedAt: number;
  opCount: number;
}

@Injectable()
export class EventsGateway implements OnModuleDestroy {
  private readonly logger = new Logger(EventsGateway.name);
  private wss?: WebSocketServer;
  private server?: HttpServer;
  private upgradeHandler?: (req: IncomingMessage, socket: Duplex, head: Buffer) => void;
  private readonly clients = new Map<WebSocket, Client>();
  // userId -> that user's open sockets, so presence flips offline only when the LAST one closes.
  private readonly userSockets = new Map<string, Set<WebSocket>>();
  private heartbeat?: NodeJS.Timeout;
  private readonly maxPayloadBytes: number;
  private readonly maxSocketsPerUser: number;
  private readonly maxSubscriptionsPerSocket: number;
  private readonly maxOperationsPerWindow: number;
  private readonly operationWindowMs: number;
  private readonly maxBufferedBytes: number;
  private readonly busListener = (channel: string, raw: string): void => {
    if (channel !== EVENTS_CHANNEL) return;
    let event: BusEvent;
    try {
      event = JSON.parse(raw);
    } catch {
      return;
    }
    this.relay(event);
  };

  constructor(
    private readonly redis: RedisService,
    private readonly auth: AuthService,
    private readonly messages: MessagesService,
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
    config: ConfigService,
  ) {
    this.maxPayloadBytes = config.get<number>('WS_MAX_PAYLOAD_BYTES') ?? 1_048_576;
    this.maxSocketsPerUser = config.get<number>('WS_MAX_SOCKETS_PER_USER') ?? 10;
    this.maxSubscriptionsPerSocket = config.get<number>('WS_MAX_SUBSCRIPTIONS') ?? 500;
    this.maxOperationsPerWindow = config.get<number>('WS_MAX_OPERATIONS_PER_WINDOW') ?? 120;
    this.operationWindowMs = config.get<number>('WS_OPERATION_WINDOW_MS') ?? 10_000;
    this.maxBufferedBytes = config.get<number>('WS_MAX_BUFFERED_BYTES') ?? 1_048_576;
  }

  /** Status as visible to OTHER users — invisible/appear-offline collapses to OFFLINE. */
  private masked(status: string): string {
    return status === 'ONLINE' || status === 'AWAY' || status === 'DND' ? status : 'OFFLINE';
  }

  /** Classify a connection as desktop/mobile/web. Prefers an explicit ?platform=, else sniffs
   *  the handshake (Tauri origin = desktop; RN/native UA = mobile; otherwise a browser = web). */
  private detectPlatform(sp: URLSearchParams, headers: IncomingMessage['headers']): string {
    const explicit = (sp.get('platform') || '').toLowerCase();
    if (explicit === 'mobile' || explicit === 'desktop' || explicit === 'web') return explicit;
    const origin = String(headers['origin'] || '').toLowerCase();
    const ua = String(headers['user-agent'] || '').toLowerCase();
    if (origin.includes('tauri.localhost') || ua.includes('tauri') || ua.includes('wry')) return 'desktop';
    if (ua.includes('okhttp') || ua.includes('expo') || ua.includes('reactnative') || ua.includes('cfnetwork') || ua.includes('darwin')) return 'mobile';
    return 'web';
  }

  /** Distinct platforms the user is currently connected from (across all their sockets). */
  private platformsForUser(userId: string): string[] {
    const socks = this.userSockets.get(userId);
    if (!socks) return [];
    const set = new Set<string>();
    for (const s of socks) { const c = this.clients.get(s); if (c?.platform) set.add(c.platform); }
    return [...set];
  }

  private publishPresence(userId: string, status: string, platforms: string[] = []): Promise<void> {
    return this.redis.publish(EVENTS_CHANNEL, {
      type: 'PRESENCE_UPDATE',
      userId,
      status: this.masked(status),
      platforms,
    });
  }

  /** Called from main.ts after the HTTP server is listening. */
  attach(server: HttpServer): void {
    this.server = server;
    this.wss = new WebSocketServer({ noServer: true, maxPayload: this.maxPayloadBytes });

    this.upgradeHandler = (req, socket, head) => {
      const { pathname } = new URL(req.url ?? '', `http://${req.headers.host}`);
      if (pathname !== '/ws') {
        socket.destroy();
        return;
      }
      this.wss!.handleUpgrade(req, socket, head, (ws) => { void this.onConnection(ws, req); });
    };
    server.on('upgrade', this.upgradeHandler);

    this.subscribeToBus();
    this.heartbeat = setInterval(() => this.pingAll(), HEARTBEAT_MS);
    this.logger.log('WebSocket gateway attached at /ws');
  }

  private async onConnection(socket: WebSocket, req: IncomingMessage): Promise<void> {
    const { searchParams } = new URL(req.url ?? '', `http://${req.headers.host}`);
    const ticket = searchParams.get('ticket');
    const userId = ticket ? await this.auth.verifyWsTicket(ticket) : null;
    if (!userId) {
      socket.close(4401, 'Invalid ticket');
      return;
    }

    if ((this.userSockets.get(userId)?.size ?? 0) >= this.maxSocketsPerUser) {
      socket.close(4429, 'Too many connections');
      return;
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      socket.close(4404, 'User not found');
      return;
    }

    // Load server memberships so guild-structure events can be scoped correctly.
    const memberships = await this.prisma.serverMember.findMany({
      where: { userId },
      select: { serverId: true },
    });
    const serverIds = new Set(memberships.map((m) => m.serverId));

    const platform = this.detectPlatform(searchParams, req.headers);
    const client: Client = {
      socket,
      userId,
      channels: new Map(),
      serverIds,
      alive: true,
      platform,
      opWindowStartedAt: Date.now(),
      opCount: 0,
    };
    this.clients.set(socket, client);

    socket.on('message', (data) => { void this.onMessage(client, data); });
    socket.on('pong', () => (client.alive = true));
    socket.on('close', () => this.handleDisconnect(socket));
    socket.on('error', () => this.handleDisconnect(socket));

    // Track this socket under its user; the first socket brings the user online.
    let sockets = this.userSockets.get(userId);
    const firstConnect = !sockets || sockets.size === 0;
    if (!sockets) {
      sockets = new Set();
      this.userSockets.set(userId, sockets);
    }
    sockets.add(socket);
    if (firstConnect) {
      // Come online at the user's saved preference (default ONLINE if unset/offline).
      const initial = user.status && user.status !== 'OFFLINE' ? user.status : 'ONLINE';
      this.presence.set(userId, initial);
    }
    // Publish on every connect (not just the first) so peers see the platform set grow
    // when the same user opens a second client (e.g. desktop + mobile).
    await this.publishPresence(userId, this.presence.get(userId), this.platformsForUser(userId));

    this.send(socket, {
      op: 'ready',
      d: {
        protocolVersion: PROTOCOL_VERSION,
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          status: user.status,
        },
        servers: [],
      },
    });
    // Give the fresh socket the current online set (with each user's active platforms) so it
    // doesn't rely on stale DB status.
    const snap = this.presence.snapshot().map((u) => ({ ...u, platforms: this.platformsForUser(u.userId) }));
    this.send(socket, { op: 'presence.snapshot', d: { users: snap } });
    this.logger.debug(`ws connected: user=${userId}`);
  }

  /** Remove a socket; if it was the user's last one, flip them offline and broadcast it. */
  private handleDisconnect(socket: WebSocket): void {
    const client = this.clients.get(socket);
    this.clients.delete(socket);
    if (!client) return;
    const sockets = this.userSockets.get(client.userId);
    if (!sockets) return;
    sockets.delete(socket);
    if (sockets.size === 0) {
      this.userSockets.delete(client.userId);
      this.presence.clear(client.userId);
      this.publishPresence(client.userId, 'OFFLINE').catch((e) =>
        this.logger.error('presence offline publish failed', e as Error),
      );
    } else {
      // Still online on another client — re-broadcast so peers see the platform set shrink
      // (e.g. they closed the mobile app but stay on desktop).
      this.publishPresence(client.userId, this.presence.get(client.userId), this.platformsForUser(client.userId)).catch((e) =>
        this.logger.error('presence platform publish failed', e as Error),
      );
    }
  }

  private async onMessage(client: Client, data: RawData): Promise<void> {
    const now = Date.now();
    if (now - client.opWindowStartedAt >= this.operationWindowMs) {
      client.opWindowStartedAt = now;
      client.opCount = 0;
    }
    client.opCount += 1;
    if (client.opCount > this.maxOperationsPerWindow) {
      client.socket.close(4429, 'Rate limit exceeded');
      return;
    }

    let env: Envelope;
    try {
      env = JSON.parse(data.toString());
    } catch {
      return this.send(client.socket, { op: 'error', d: { message: 'Invalid JSON' } });
    }
    if (!env?.op) {
      return this.send(client.socket, { op: 'error', d: { message: 'Missing op' } });
    }

    try {
      switch (env.op) {
        case 'ping':
          return this.send(client.socket, { op: 'pong', d: {} });
        case 'subscribe':
          if (env.d?.channelId) {
            const channelId = CHANNEL_ID.parse(env.d.channelId);
            if (!client.channels.has(channelId) && client.channels.size >= this.maxSubscriptionsPerSocket) {
              return this.send(client.socket, { op: 'error', d: { message: 'Subscription limit reached' } });
            }
            const access = await this.messages.assertChannelAccess(channelId, client.userId);
            client.channels.set(channelId, access.serverId);
          }
          return;
        case 'unsubscribe':
          if (env.d?.channelId) client.channels.delete(env.d.channelId);
          return;
        case 'message.send': {
          const { channelId, content, nonce, attachments, replyToId } = env.d ?? {};
          const message = await this.messages.create(channelId, client.userId, {
            content,
            attachments,
            nonce,
            replyToId,
          });
          // Echo to sender immediately with the nonce for optimistic-UI reconciliation.
          this.send(client.socket, { op: 'message.created', d: { message, nonce } });
          return;
        }
        case 'typing.start':
          if (env.d?.channelId) {
            const channelId = CHANNEL_ID.parse(env.d.channelId);
            await this.messages.assertChannelAccess(channelId, client.userId);
            await this.redis.publish(EVENTS_CHANNEL, {
              type: 'TYPING_START',
              channelId,
              userId: client.userId,
            });
          }
          return;
        case 'presence.update': {
          const status = env.d?.status;
          const STATUSES = ['ONLINE', 'AWAY', 'DND', 'INVISIBLE', 'OFFLINE'];
          if (status && STATUSES.includes(status)) {
            // Transient changes (auto-away idle flips) update live presence only; a
            // manual choice also persists as the user's preference for next login.
            if (!env.d?.transient) {
              await this.prisma.user.update({ where: { id: client.userId }, data: { status } });
            }
            this.presence.set(client.userId, status);
            await this.publishPresence(client.userId, status, this.platformsForUser(client.userId));
          }
          return;
        }
        default:
          return this.send(client.socket, { op: 'error', d: { message: `Unknown op: ${env.op}` } });
      }
    } catch (err) {
      this.logger.error(`op ${env.op} failed`, err as Error);
      this.send(client.socket, { op: 'error', d: { message: 'Operation failed' } });
    }
  }

  /** Subscribe once to Redis and relay bus events to locally-connected sockets. */
  private subscribeToBus(): void {
    const sub = this.redis.getSubscriber();
    sub.subscribe(EVENTS_CHANNEL).catch((e) => this.logger.error('subscribe failed', e));
    sub.on('message', this.busListener);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = undefined;
    }
    if (this.server && this.upgradeHandler) {
      this.server.off('upgrade', this.upgradeHandler);
    }
    this.redis.getSubscriber().off('message', this.busListener);
    for (const socket of this.clients.keys()) socket.terminate();
    this.clients.clear();
    this.userSockets.clear();
    const wss = this.wss;
    this.wss = undefined;
    if (wss) await new Promise<void>((resolve) => wss.close(() => resolve()));
  }


  /**
   * Relay a bus event to the appropriate connected WebSocket clients.
   *
   * Audience decisions:
   * - Channel-scoped (message, typing, watchparty): only subscribers of that channel.
   * - Global (presence): all connected clients.
   * - User-targeted (notify, mention, call.ring): only that specific user's sockets.
   * - Server-scoped (channel.*, role.*, member.*, server.*): all members of that server.
   *   Membership is tracked per-connection (loaded at connect, updated dynamically
   *   when MEMBER_JOINED / MEMBER_LEFT / MEMBER_KICKED arrive).
   *   This ensures a client learns about a channel it hasn't subscribed to,
   *   and roles/member changes are visible to all server members in real time.
   */
  private relay(event: BusEvent): void {
    const channelId =
      'channelId' in event ? event.channelId : (event as any).message?.channelId;

    for (const client of this.clients.values()) {
      if (client.socket.readyState !== WebSocket.OPEN) continue;
      // Per-user targeted events — deliver only to that user's sockets.
      if (event.type === 'NOTIFY') {
        if (client.userId === event.userId) this.send(client.socket, { op: 'notify', d: {} });
        continue;
      }
      if (event.type === 'MENTION') {
        if (client.userId === event.userId) {
          this.send(client.socket, {
            op: 'mention',
            d: { channelId: event.channelId, messageId: event.messageId, channelName: event.channelName, authorName: event.authorName, preview: event.preview },
          });
        }
        continue;
      }
      if (event.type === 'CALL_RING') {
        if (client.userId === event.userId) {
          this.send(client.socket, {
            op: 'call.ring',
            d: { channelId: event.channelId, callerId: event.callerId, callerName: event.callerName, callerAvatar: event.callerAvatar },
          });
        }
        continue;
      }
      if (event.type === 'WATCHPARTY_LEFT') {
        if (client.userId === event.userId) {
          this.send(client.socket, { op: 'watchparty.left', d: { channelId: event.channelId } });
        }
        continue;
      }

      // ── Voice occupancy — server-scoped for server channels, channel-scoped for DMs ──
      if (event.type === 'VOICE_OCCUPANCY_CHANGED') {
        if (event.serverId) {
          if (!client.serverIds.has(event.serverId)) continue;
        } else if (!client.channels.has(event.channelId)) continue;
        this.send(client.socket, { op: 'voice.occupancy', d: { channelId: event.channelId } });
        continue;
      }

      // ── Server-scoped events — deliver to all members of that server ──
      const serverId = (event as any).serverId;
      if (serverId) {
        const joiningOwnSock = event.type === 'MEMBER_JOINED' && client.userId === (event as any).userId;
        if (!joiningOwnSock && !client.serverIds.has(serverId)) continue;

        switch (event.type) {
          case 'CHANNEL_CREATED':
            this.send(client.socket, { op: 'channel.created', d: { channel: event.channel } });
            break;
          case 'CHANNEL_DELETED':
            client.channels.delete(event.channelId);
            this.send(client.socket, { op: 'channel.deleted', d: { channelId: event.channelId } });
            break;
          case 'ROLE_CREATED':
            this.send(client.socket, { op: 'role.created', d: { role: event.role } });
            break;
          case 'ROLE_UPDATED':
            this.send(client.socket, { op: 'role.updated', d: { role: event.role } });
            break;
          case 'ROLE_DELETED':
            this.send(client.socket, { op: 'role.deleted', d: { roleId: event.roleId } });
            break;
          case 'MEMBER_JOINED':
            // Update membership tracking for the joined user if they have other sockets.
            if (client.userId === event.userId) client.serverIds.add(serverId);
            this.send(client.socket, { op: 'member.joined', d: { member: event.member } });
            break;
          case 'MEMBER_LEFT':
            // Update membership tracking: remove server from this user's other sockets.
            if (client.userId === event.userId) {
              client.serverIds.delete(serverId);
              for (const [channelId, channelServerId] of client.channels) {
                if (channelServerId === serverId) client.channels.delete(channelId);
              }
            }
            this.send(client.socket, { op: 'member.left', d: { userId: event.userId } });
            break;
          case 'MEMBER_KICKED':
            if (client.userId === event.userId) {
              client.serverIds.delete(serverId);
              for (const [channelId, channelServerId] of client.channels) {
                if (channelServerId === serverId) client.channels.delete(channelId);
              }
            }
            this.send(client.socket, { op: 'member.kicked', d: { userId: event.userId } });
            break;
          case 'SERVER_UPDATED':
            this.send(client.socket, { op: 'server.updated', d: { server: event.server } });
            break;
          case 'SERVER_DELETED':
            // All members lose this server membership.
            client.serverIds.delete(serverId);
            this.send(client.socket, { op: 'server.deleted', d: { serverId: event.serverId } });
            break;
        }
        continue;
      }

      const global = event.type === 'PRESENCE_UPDATE';
      if (!global && (!channelId || !client.channels.has(channelId))) continue;

      switch (event.type) {
        case 'MESSAGE_CREATED': {
          const d: any = { message: event.message };
          // Echo nonce back only to the author for optimistic reconciliation (FR-MSG-002).
          if (event.nonce && client.userId === event.message.authorId) {
            d.nonce = event.nonce;
          }
          this.send(client.socket, { op: 'message.created', d });
          break;
        }
        case 'MESSAGE_UPDATED':
          this.send(client.socket, { op: 'message.updated', d: { message: event.message } });
          break;
        case 'MESSAGE_DELETED':
          this.send(client.socket, { op: 'message.deleted', d: { id: event.id, channelId: event.channelId } });
          break;
        case 'TYPING_START':
          this.send(client.socket, { op: 'typing', d: { channelId: event.channelId, userId: event.userId } });
          break;
        case 'PRESENCE_UPDATE': {
          // FR-SOC-004: invisible reads as offline to peers.
          // The user's own sockets see the true status; everyone else sees OFFLINE.
          const visibleStatus = event.status === 'INVISIBLE' && client.userId !== event.userId
            ? 'OFFLINE'
            : event.status;
          this.send(client.socket, { op: 'presence', d: { userId: event.userId, status: visibleStatus, platforms: event.platforms || [] } });
          break;
        }
        case 'WATCHPARTY_SYNC':
          this.send(client.socket, {
            op: 'watchparty.sync',
            d: {
              channelId: event.channelId,
              state: event.excludedUserIds?.includes(client.userId) ? null : event.state,
            },
          });
          break;
      }
    }
  }

  private pingAll(): void {
    for (const client of this.clients.values()) {
      if (!client.alive) {
        client.socket.terminate();
        this.handleDisconnect(client.socket);
        continue;
      }
      client.alive = false;
      try {
        client.socket.ping();
      } catch {
        /* ignore */
      }
    }
  }

  private send(socket: WebSocket, env: Envelope): void {
    if (socket.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > this.maxBufferedBytes) {
      socket.close(4413, 'Client is not consuming events');
      return;
    }
    socket.send(JSON.stringify(env));
  }
}
