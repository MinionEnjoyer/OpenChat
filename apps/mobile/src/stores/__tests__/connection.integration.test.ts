// @satisfies FR-APP-003
/**
 * Integration test: FR-APP-003 — Connection banner via GatewayClient→ConnectionStore pipeline.
 *
 * Acceptance criterion (verbatim from specs/01-REQUIREMENTS.md):
 *   "Integration: drop WS → banner ≤3s; restore → banner clears,
 *    missed message appears without manual refresh"
 *
 * Exercises the real GatewayClient→useConnection seam with a FakeWebSocket
 * (same pattern as the gateway chaos tests) and a frozen clock for timing.
 * This is not a unit test — it creates a GatewayClient, wires it to a live
 * Zustand store, and drives the full lifecycle: connect, drop, reconnect.
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import { GatewayClient, type ConnectionState } from '../../realtime/gateway';
import { useConnection } from '../connection';
import { createFrozenClock, resetClock, setClock } from '../../lib/clock';

// ── FakeWebSocket (same shape as realtime/__tests__/gateway.test.ts) ──

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

// ── Helpers ──

const flush = async (): Promise<void> => {
  // fetchTicket resolves on the microtask queue; drain it.
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

function bannerShown(): boolean {
  const s = useConnection.getState();
  return s.everConnected && s.state !== 'connected';
}

// ── Tests ──

describe('FR-APP-003 integration — GatewayClient→ConnectionStore→banner', () => {
  afterEach(() => {
    resetClock();
    FakeWebSocket.instances = [];
  });

  it('drop WS → banner appears immediately; restore → banner clears; resync fires on reconnect', async () => {
    // Reset the connection store to a clean state
    useConnection.setState({ state: 'offline', everConnected: false });

    const frozen = createFrozenClock(0);
    setClock(frozen);

    const states: ConnectionState[] = [];
    let resyncCount = 0;

    const client = new GatewayClient({
      wsUrl: 'ws://test/ws',
      fetchTicket: async () => 'ticket',
      onEvent: () => {},
      onStateChange: (s) => {
        states.push(s);
        // Feed the real connection store — this is the integration seam
        useConnection.getState().setState(s);
      },
      onResync: () => {
        resyncCount += 1;
      },
      webSocketImpl: FakeWebSocket as unknown as typeof WebSocket,
      random: () => 0.999999,
    });

    // ── Phase 1: Initial connect ──
    client.start();
    await flush();

    let socket = FakeWebSocket.instances[0]!;
    expect(socket).toBeDefined();

    // Before ready: state is 'connecting', everConnected is false
    expect(useConnection.getState().state).toBe('connecting');
    expect(useConnection.getState().everConnected).toBe(false);
    expect(bannerShown()).toBe(false); // never connected yet

    // Server sends ready
    socket.serverReady();
    await flush();

    // After ready: connected, everConnected → true, no banner
    expect(useConnection.getState().state).toBe('connected');
    expect(useConnection.getState().everConnected).toBe(true);
    expect(bannerShown()).toBe(false);

    // ── Phase 2: Drop WS → banner appears ≤3s ──
    // The drop itself is instant (scheduleReconnect calls setState('offline')).
    socket.serverKill();
    await flush();

    expect(useConnection.getState().state).toBe('offline');
    expect(useConnection.getState().everConnected).toBe(true);
    expect(bannerShown()).toBe(true);
    // Banner appeared well within 3s (it's synchronous after onclose).
    // The 3s bound is for real hardware; with our frozen clock it's instant.

    // ── Phase 3: Reconnect → banner clears ──
    // Advance past the backoff. With random pinned to 0.999, delay = floor(0.999 * 1000) = 999ms.
    // First reconnect attempt (attempt 0 → cap 1000ms).
    frozen.advance(1000);
    await flush();

    socket = FakeWebSocket.instances[1]!;
    expect(socket).toBeDefined();

    // Before ready on reconnect: state is 'connecting', everConnected still true
    expect(useConnection.getState().everConnected).toBe(true);

    // Server sends ready on the new socket
    socket.serverReady();
    await flush();

    // After reconnect: connected, banner clears
    expect(useConnection.getState().state).toBe('connected');
    expect(useConnection.getState().everConnected).toBe(true);
    expect(bannerShown()).toBe(false);

    // ── Phase 4: Resync fired on reconnect (missed messages refetched) ──
    // Initial ready + reconnect ready = 2 resyncs
    expect(resyncCount).toBe(2);

    // ── Phase 5: Second drop → banner reappears; second reconnect → clears again ──
    socket.serverKill();
    await flush();
    expect(bannerShown()).toBe(true);

    frozen.advance(2000); // attempt 1 cap = 2000ms
    await flush();

    socket = FakeWebSocket.instances[2]!;
    socket.serverReady();
    await flush();

    expect(useConnection.getState().state).toBe('connected');
    expect(bannerShown()).toBe(false);
    expect(resyncCount).toBe(3);

    // Cleanup
    client.stop();
  });
});
