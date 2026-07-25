/**
 * Gateway client (06 §2 realtime/, P1-05).
 *
 * Envelope: {op, d, id?} (03-CONTRACTS). Connect: GET /auth/ws-ticket (bearer,
 * FR-AUTH-005) → ws://…/ws?ticket=<t>. The server ws-pings every 30s and RN's
 * WebSocket auto-pongs (E2). On drop: exponential backoff with full jitter
 * (NFR-07), and on every `ready` the subscription registry is replayed and
 * `onResync` fires so the query layer refetches what it missed (06 §3 — no
 * event replay upstream, so reconnect = resubscribe + refetch).
 */
import { backoffDelayMs } from './backoff';
import { clock, type TimeoutHandle } from '../lib/clock';
import { logger } from '../lib/logger';
import type { S2CFrame } from './events';

export type ConnectionState = 'connecting' | 'connected' | 'offline';

export interface GatewayDeps {
  wsUrl: string;
  fetchTicket: () => Promise<string>;
  onEvent: (event: S2CFrame) => void;
  onStateChange: (state: ConnectionState) => void;
  /** Fired after resubscribe on every ready — refetch active queries here. */
  onResync: () => void;
  /** Injectable for tests. */
  webSocketImpl?: typeof WebSocket;
  random?: () => number;
}

export class GatewayClient {
  private ws: WebSocket | null = null;
  private subscriptions = new Set<string>();
  private attempt = 0;
  private stopped = true;
  private reconnectTimer: TimeoutHandle | null = null;
  private state: ConnectionState = 'offline';

  constructor(private readonly deps: GatewayDeps) {}

  start(): void {
    this.stopped = false;
    void this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer !== null) clock.clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
    this.setState('offline');
  }

  /** Idempotent (NFR-07): the registry is a set; re-adding is a no-op. */
  subscribe(channelId: string): void {
    if (this.subscriptions.has(channelId)) return;
    this.subscriptions.add(channelId);
    this.send('subscribe', { channelIds: [channelId] });
  }

  unsubscribe(channelId: string): void {
    if (!this.subscriptions.delete(channelId)) return;
    this.send('unsubscribe', { channelIds: [channelId] });
  }

  private setState(state: ConnectionState): void {
    if (this.state === state) return;
    this.state = state;
    this.deps.onStateChange(state);
  }

  private send(op: string, d: unknown): void {
    if (this.ws?.readyState === 1 /* OPEN */) {
      this.ws.send(JSON.stringify({ op, d }));
    }
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    this.setState('connecting');
    let ticket: string;
    try {
      ticket = await this.deps.fetchTicket();
    } catch (e) {
      logger.warn('gateway: ticket fetch failed', { error: String(e) });
      this.scheduleReconnect();
      return;
    }
    if (this.stopped) return;

    const WS = this.deps.webSocketImpl ?? WebSocket;
    const ws = new WS(`${this.deps.wsUrl}?ticket=${encodeURIComponent(ticket)}`);
    this.ws = ws;

    ws.onmessage = (msg: { data: unknown }) => {
      let frame: S2CFrame;
      try {
        frame = JSON.parse(String(msg.data)) as S2CFrame;
      } catch {
        return;
      }
      if (frame.op === 'ready') {
        this.attempt = 0;
        this.setState('connected');
        // Replay the registry, then let the data layer repair what it missed.
        if (this.subscriptions.size > 0) {
          this.send('subscribe', { channelIds: [...this.subscriptions] });
        }
        this.deps.onResync();
      }
      this.deps.onEvent(frame);
    };

    ws.onclose = () => {
      if (this.ws === ws) this.ws = null;
      this.scheduleReconnect();
    };
    ws.onerror = () => {
      // onclose follows; nothing to do here.
    };
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    this.setState('offline');
    const delay = backoffDelayMs(this.attempt, this.deps.random);
    this.attempt += 1;
    logger.info('gateway: reconnect scheduled', { attempt: this.attempt, delayMs: delay });
    this.reconnectTimer = clock.setTimeout(() => void this.connect(), delay);
  }
}
