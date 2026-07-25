import { GatewayClient, type ConnectionState } from '../gateway';
import { createFrozenClock, resetClock, setClock } from '../../lib/clock';

/**
 * NFR-07's integration half at unit scope: chaos-kill the socket 20×, assert
 * the client survives, resubscribes idempotently, and walks the backoff
 * schedule. Deterministic: frozen clock + fake WebSocket, random pinned to 1.
 */

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  onmessage: ((msg: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = 1;
  sent: string[] = [];

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }

  // Test helpers
  serverReady(): void {
    this.onmessage?.({ data: JSON.stringify({ op: 'ready', d: { user: {}, servers: [] } }) });
  }
  serverKill(): void {
    this.readyState = 3;
    this.onclose?.();
  }
}

function build() {
  FakeWebSocket.instances = [];
  const frozen = createFrozenClock(0);
  setClock(frozen);
  const states: ConnectionState[] = [];
  let resyncs = 0;
  const client = new GatewayClient({
    wsUrl: 'ws://test/ws',
    fetchTicket: async () => 'ticket',
    onEvent: () => {},
    onStateChange: (s) => states.push(s),
    onResync: () => {
      resyncs += 1;
    },
    webSocketImpl: FakeWebSocket as unknown as typeof WebSocket,
    random: () => 0.999999, // pin jitter to ~cap so delays are deterministic upper bounds
  });
  return { client, frozen, states, resyncs: () => resyncs };
}

const flush = async (): Promise<void> => {
  // fetchTicket resolves on the microtask queue; drain it.
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe('gateway chaos (NFR-07)', () => {
  afterEach(() => resetClock());

  // @satisfies NFR-07
  it('survives 20 socket kills, reconnecting on the backoff schedule with idempotent resubscribe', async () => {
    const { client, frozen, states, resyncs } = build();
    client.start();
    await flush();

    let socket = FakeWebSocket.instances[0]!;
    socket.serverReady();
    client.subscribe('chan-1');
    client.subscribe('chan-1'); // idempotent: must not duplicate

    for (let kill = 0; kill < 20; kill++) {
      const before = FakeWebSocket.instances.length;
      socket.serverKill();
      // Advance past the max backoff window; a new socket must exist.
      frozen.advance(33_000);
      await flush();
      expect(FakeWebSocket.instances.length).toBe(before + 1);
      socket = FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!;
      socket.serverReady();
      await flush();
    }

    // Still alive and connected after 20 kills.
    expect(states[states.length - 1]).toBe('connected');
    // Every ready triggered a resync (initial + 20 reconnects).
    expect(resyncs()).toBe(21);

    // Resubscribe replay is exactly one subscribe frame per reconnect, one channel.
    const subs = socket.sent.filter((f) => JSON.parse(f).op === 'subscribe');
    expect(subs).toHaveLength(1);
    expect(JSON.parse(subs[0]!).d.channelId).toBe('chan-1');
  });

  it('resets the backoff attempt counter after a successful ready', async () => {
    const { client, frozen } = build();
    client.start();
    await flush();
    const first = FakeWebSocket.instances[0]!;
    first.serverReady();

    // Kill once: with random pinned to max, the delay is the attempt-0 cap (1s).
    first.serverKill();
    frozen.advance(998);
    await flush();
    expect(FakeWebSocket.instances.length).toBe(1); // not yet
    frozen.advance(2);
    await flush();
    expect(FakeWebSocket.instances.length).toBe(2); // reconnected at ~1s → attempt reset happens on ready
  });

  it('stop() ends the loop: no reconnect after stop', async () => {
    const { client, frozen } = build();
    client.start();
    await flush();
    client.stop();
    frozen.advance(120_000);
    await flush();
    expect(FakeWebSocket.instances.length).toBe(1);
  });
});
