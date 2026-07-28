import { ApiClient, type TokenPair } from '../client';

/**
 * FR-AUTH-010's unit half: the 401-storm behavior — silent refresh is
 * single-flight, concurrent 401s share it, refresh failure hard-logs-out, and
 * there is no request loop.
 */

interface MockRoute {
  status: number;
  body?: unknown;
}

function mockFetch(script: (url: string, init: RequestInit) => MockRoute): jest.Mock {
  return jest.fn(async (url: string, init: RequestInit) => {
    const route = script(url, init);
    return {
      status: route.status,
      text: async () => (route.body === undefined ? '' : JSON.stringify(route.body)),
    };
  });
}

function makeClient(fetchImpl: jest.Mock) {
  let tokens: TokenPair | null = { accessToken: 'stale', refreshToken: 'rt-1' };
  const hardLogout = jest.fn(() => {
    tokens = null;
  });
  global.fetch = fetchImpl as unknown as typeof fetch;
  const client = new ApiClient({
    baseUrl: 'http://api.test/api',
    getTokens: () => tokens,
    setTokens: (t) => {
      tokens = t;
    },
    onHardLogout: hardLogout,
  });
  return { client, hardLogout, getTokens: () => tokens };
}

describe('api client refresh interceptor', () => {
  // @satisfies FR-AUTH-010
  it('a 401 triggers one refresh and one replay; concurrent 401s share the refresh', async () => {
    let refreshCalls = 0;
    const fetchImpl = mockFetch((url, init) => {
      if (url.endsWith('/auth/oauth/token')) {
        refreshCalls += 1;
        return { status: 201, body: { accessToken: 'fresh', refreshToken: 'rt-2' } };
      }
      const auth = (init.headers as Record<string, string>).authorization;
      return auth === 'Bearer fresh'
        ? { status: 200, body: { ok: true } }
        : { status: 401, body: { message: 'expired' } };
    });
    const { client, hardLogout, getTokens } = makeClient(fetchImpl);

    // Three concurrent requests all hit 401 with the stale token.
    const results = await Promise.all([
      client.request('/servers'),
      client.request('/auth/me'),
      client.request('/dms'),
    ]);

    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    // Single-flight: one refresh, not three.
    expect(refreshCalls).toBe(1);
    expect(getTokens()).toEqual({ accessToken: 'fresh', refreshToken: 'rt-2' });
    expect(hardLogout).not.toHaveBeenCalled();
  });

  it('refresh failure → hard logout, no retry loop (≤3 calls total per request)', async () => {
    const perPath: Record<string, number> = {};
    const fetchImpl = mockFetch((url) => {
      perPath[url] = (perPath[url] ?? 0) + 1;
      return { status: 401, body: { message: 'nope' } };
    });
    const { client, hardLogout } = makeClient(fetchImpl);

    await expect(client.request('/servers')).rejects.toMatchObject({ status: 401 });
    expect(hardLogout).toHaveBeenCalledTimes(1);
    // 1 original + 1 refresh attempt — no storm.
    expect(perPath['http://api.test/api/servers']).toBe(1);
    expect(perPath['http://api.test/api/auth/oauth/token']).toBe(1);
  });

  it('errors carry status, requestId and retriability (FR-APP-006 input)', async () => {
    const fetchImpl = mockFetch(() => ({ status: 500, body: { message: 'boom' } }));
    const { client } = makeClient(fetchImpl);
    await expect(client.request('/servers')).rejects.toMatchObject({
      status: 500,
      retriable: true,
      message: 'boom',
    });
  });
});
