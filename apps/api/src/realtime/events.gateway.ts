import { Injectable, Logger } from '@nestjs/common';
import { WebSocketServer, WebSocket, RawData } from 'ws';
import type { Server as HttpServer, IncomingMessage } from 'http';
import { RedisService } from '../redis/redis.service';
import { AuthService } from '../auth/auth.service';
import { MessagesService } from '../messages/messages.service';
import { PrismaService } from '../prisma/prisma.service';

const EVENTS_CHANNEL = 'chat:events';
const HEARTBEAT_MS = 30_000;

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
  | { type: 'PRESENCE_UPDATE'; userId: string; status: string }
  | { type: 'WATCHPARTY_SYNC'; channelId: string; state: any | null }
  | { type: 'NOTIFY'; userId: string }
  | { type: 'MENTION'; userId: string; channelId: string; messageId: string; channelName: string; authorName: string; preview: string }
  | { type: 'CALL_RING'; userId: string; channelId: string; callerId: string; callerName: string; callerAvatar: string | null }
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
  channels: Set<string>;
  /** Server IDs this user belongs to — populated on connect, kept current by MEMBER_JOINED/LEFT events. */
  serverIds: Set<string>;
  alive: boolean;
}

@Injectable()
export class EventsGateway {
  private readonly logger = new Logger(EventsGateway.name);
  private wss?: WebSocketServer;
  private readonly clients = new Map<WebSocket, Client>();
  private heartbeat?: NodeJS.Timeout;

  constructor(
    private readonly redis: RedisService,
    private readonly auth: AuthService,
    private readonly messages: MessagesService,
    private readonly prisma: PrismaService,
  ) {}

  /** Called from main.ts after the HTTP server is listening. */
  attach(server: HttpServer): void {
    this.wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (req, socket, head) => {
      const { pathname } = new URL(req.url ?? '', `http://${req.headers.host}`);
      if (pathname !== '/ws') {
        socket.destroy();
        return;
      }
      this.wss!.handleUpgrade(req, socket, head, (ws) => { void this.onConnection(ws, req); });
    });

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

    const client: Client = { socket, userId, channels: new Set(), serverIds, alive: true };
    this.clients.set(socket, client);

    socket.on('message', (data) => { void this.onMessage(client, data); });
    socket.on('pong', () => (client.alive = true));
    socket.on('close', () => this.clients.delete(socket));
    socket.on('error', () => this.clients.delete(socket));

    this.send(socket, {
      op: 'ready',
      d: {
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
    this.logger.debug(`ws connected: user=${userId}`);
  }

  private async onMessage(client: Client, data: RawData): Promise<void> {
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
          if (env.d?.channelId) client.channels.add(env.d.channelId);
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
            await this.redis.publish(EVENTS_CHANNEL, {
              type: 'TYPING_START',
              channelId: env.d.channelId,
              userId: client.userId,
            });
          }
          return;
        case 'presence.update': {
          const status = env.d?.status;
          if (status) {
            await this.prisma.user.update({ where: { id: client.userId }, data: { status } });
            await this.redis.publish(EVENTS_CHANNEL, {
              type: 'PRESENCE_UPDATE',
              userId: client.userId,
              status,
            });
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
    sub.on('message', (channel, raw) => {
      if (channel !== EVENTS_CHANNEL) return;
      let event: BusEvent;
      try {
        event = JSON.parse(raw);
      } catch {
        return;
      }
      this.relay(event);
    });
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
            if (client.userId === event.userId) client.serverIds.delete(serverId);
            this.send(client.socket, { op: 'member.left', d: { userId: event.userId } });
            break;
          case 'MEMBER_KICKED':
            if (client.userId === event.userId) client.serverIds.delete(serverId);
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
        case 'PRESENCE_UPDATE':
          this.send(client.socket, { op: 'presence', d: { userId: event.userId, status: event.status } });
          break;
        case 'WATCHPARTY_SYNC':
          this.send(client.socket, { op: 'watchparty.sync', d: { channelId: event.channelId, state: event.state } });
          break;
      }
    }
  }

  private pingAll(): void {
    for (const client of this.clients.values()) {
      if (!client.alive) {
        client.socket.terminate();
        this.clients.delete(client.socket);
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
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(env));
  }
}
