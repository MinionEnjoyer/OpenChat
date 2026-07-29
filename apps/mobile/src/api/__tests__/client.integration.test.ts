// @satisfies FR-AUTH-010
/**
 * Integration test: ApiClient refresh interceptor wired to a real Zustand
 * store — only global.fetch is mocked. Exercises the full 401 → refresh →
 * replay pipeline and verifies store state transitions.
 *
 * Acceptance criterion: "Integration (mock 401 storm): no crash, no request
 * loop (≤3 retries)"
 */
import { create } from 'zustand';
import {
  ApiClient,
  type TokenPair,
} from '../client';

interface SessionState {
  status: 'signedIn' | 'signedOut';
  tokens: TokenPair | null;
}

// ── helpers ────────────────────────────────────────────────────────────────

function createSessionStore() {
  return create<SessionState>(() => ({
    status: 'signedOut',
    tokens: null,
  }));
}

function makeClient(
  store: ReturnType<typeof createSessionStore>,
): { client: ApiClient; getStore: () => SessionState } {
  const client = new ApiClient({
    baseUrl: 'http://api.test/api',
    getTokens: () => store.getState().tokens,
    setTokens: async (tokens) => {
      store.setState({ tokens });
    },
    onHardLogout: () => {
      store.setState({ status: 'signedOut', tokens: null });
    },
  });
  return { client, getStore: () => store.getState() };
}

function mockFetch(handler: (url: string, init: RequestInit) => { status: number; body?: unknown }) {
  const fn = jest.fn(async (url: string, init: RequestInit) => {
    const route = handler(url, init);
    return {
      status: route.status,
      text: async () => (route.body === undefined ? '' : JSON.stringify(route.body)),
    };
  });
  (global as unknown as { fetch: typeof fetch }).fetch = fn as unknown as typeof fetch;
  return fn;
}

// ── tests ──────────────────────────────────────────────────────────────────

describe('FR-AUTH-010 integration: ApiClient + store', () => {
  let store: ReturnType<typeof createSessionStore>;
  let client: ApiClient;
  let getStore: () => SessionState;

  beforeEach(() => {
    store = createSessionStore();
    const wired = makeClient(store);
    client = wired.client;
    getStore = wired.getStore;
  });

  it('401 triggers exactly one refresh + one replay; concurrent 401s share the refresh', async () => {
    store.setState({ status: 'signedIn', tokens: { accessToken: 'stale', refreshToken: 'rt-1' } });

    let refreshCalls = 0;
    const fetchSpy = mockFetch((url, init) => {
      if (url.endsWith('/auth/oauth/token')) {
        refreshCalls += 1;
        return { status: 201, body: { accessToken: 'fresh', refreshToken: 'rt-2' } };
      }
      const auth = (init.headers as Record<string, string>).authorization;
      return auth === 'Bearer fresh'
        ? { status: 200, body: { ok: true } }
        : { status: 401, body: { message: 'expired' } };
    });

    const results = await Promise.all([
      client.request<{ ok: boolean }>('/servers'),
      client.request<{ ok: boolean }>('/auth/me'),
      client.request<{ ok: boolean }>('/dms'),
    ]);

    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(refreshCalls).toBe(1); // single-flight
    expect(getStore().tokens).toEqual({ accessToken: 'fresh', refreshToken: 'rt-2' });
    expect(getStore().status).toBe('signedIn');
  });

  it('refresh failure → hard logout, no retry loop (≤3 HTTP calls per request)', async () => {
    store.setState({ status: 'signedIn', tokens: { accessToken: 'stale', refreshToken: 'rt-1' } });

    const perPath: Record<string, number> = {};
    mockFetch((url) => {
      perPath[url] = (perPath[url] ?? 0) + 1;
      return { status: 401, body: { message: 'nope' } };
    });

    await expect(client.request('/servers')).rejects.toMatchObject({ status: 401 });

    // 1 original + 1 refresh attempt — no storm.
    expect(perPath['http://api.test/api/servers']).toBe(1);
    expect(perPath['http://api.test/api/auth/oauth/token']).toBe(1);
    // Store must be cleared.
    expect(getStore().status).toBe('signedOut');
    expect(getStore().tokens).toBeNull();
  });

  it('refresh succeeds but replay still 401 → hard logout', async () => {
    store.setState({ status: 'signedIn', tokens: { accessToken: 'stale', refreshToken: 'rt-1' } });

    mockFetch((url, init) => {
      if (url.endsWith('/auth/oauth/token')) {
        return { status: 201, body: { accessToken: 'fresh', refreshToken: 'rt-2' } };
      }
      // Everything else always 401s
      return { status: 401, body: { message: 'expired' } };
    });

    await expect(client.request('/servers')).rejects.toMatchObject({ status: 401 });
    expect(getStore().status).toBe('signedOut');
    expect(getStore().tokens).toBeNull();
  });
});
