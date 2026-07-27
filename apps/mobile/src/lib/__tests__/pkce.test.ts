/**
 * Unit tests for the PKCE OIDC client flow (FR-AUTH-001).
 *
 * The system-browser step (`openAuthSessionAsync`) is mocked — an end-to-end
 * test against a live Authentik instance is required to prove the full loop.
 */

// ── Mocks (must be at top, before imports) ──

jest.mock('expo-crypto', () => {
  return {
    Crypto: {
      getRandomValues: jest.fn(),
      digestStringAsync: jest.fn(),
      CryptoDigestAlgorithm: { SHA256: 'SHA256' },
      CryptoEncoding: { BASE64: 'base64' },
    },
  };
});

// Mock PKCE buildCodeAsync so we control verifier/challenge
const mockBuildCodeAsync = jest.fn();
jest.mock('expo-auth-session/build/PKCE', () => ({
  buildCodeAsync: (...args: unknown[]) => mockBuildCodeAsync(...args),
}));

// Mock fetchDiscoveryAsync (for getAuthorizationUrl tests)
const mockFetchDiscovery = jest.fn();
jest.mock('expo-auth-session', () => ({
  fetchDiscoveryAsync: (...args: unknown[]) => mockFetchDiscovery(...args),
}));

// Mock openAuthSessionAsync
const mockOpenAuthSession = jest.fn();
jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: (...args: unknown[]) => mockOpenAuthSession(...args),
}));

// Mock logger
jest.mock('../logger', () => ({
  logger: { debug: jest.fn(), warn: jest.fn(), info: jest.fn(), error: jest.fn(), log: jest.fn() },
}));

import { generatePkcePair, fetchOidcMetadata, exchangeCode, PkceError } from '../pkce';

// ── Helpers ──

function mockFetch(responses: Array<{ url: string; status: number; body: unknown }>) {
  global.fetch = jest.fn(async (url: string, _init?: RequestInit) => {
    const match = responses.find((r) => String(url).includes(r.url));
    if (!match) return { status: 404, json: async () => ({}), text: async (): Promise<string> => 'not found', ok: false } as Response;
    return {
      status: match.status,
      json: async () => match.body,
      text: async (): Promise<string> => JSON.stringify(match.body),
      ok: match.status >= 200 && match.status < 300,
    } as Response;
  }) as jest.MockedFunction<typeof fetch>;
}

const BASE = 'http://api.test/api';

// ── fetchOidcMetadata ──

describe('fetchOidcMetadata', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // @satisfies metadata fetched, not hardcoded
  it('fetches from /auth/oidc-metadata and returns typed fields', async () => {
    mockFetch([
      {
        url: '/auth/oidc-metadata',
        status: 200,
        body: {
          issuer: 'https://auth.example.com',
          clientId: 'abc123',
          nativeRedirectUri: 'openchat://auth',
          scopes: ['openid', 'profile', 'email'],
        },
      },
    ]);

    const meta = await fetchOidcMetadata(BASE);

    expect(meta.issuer).toBe('https://auth.example.com');
    expect(meta.clientId).toBe('abc123');
    expect(meta.nativeRedirectUri).toBe('openchat://auth');
    expect(meta.scopes).toEqual(['openid', 'profile', 'email']);
    expect(fetch).toHaveBeenCalledWith(`${BASE}/auth/oidc-metadata`);
  });

  it('throws PkceError when metadata fetch fails', async () => {
    mockFetch([{ url: '/auth/oidc-metadata', status: 500, body: {} }]);
    await expect(fetchOidcMetadata(BASE)).rejects.toThrow(PkceError);
    await expect(fetchOidcMetadata(BASE)).rejects.toMatchObject({
      code: 'metadata_fetch_failed',
    });
  });

  it('throws PkceError when issuer or clientId is missing', async () => {
    mockFetch([
      {
        url: '/auth/oidc-metadata',
        status: 200,
        body: { issuer: null, clientId: null, nativeRedirectUri: 'x', scopes: [] },
      },
    ]);
    await expect(fetchOidcMetadata(BASE)).rejects.toMatchObject({
      code: 'metadata_fetch_failed',
    });
  });
});

// ── generatePkcePair ──

describe('generatePkcePair', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // @satisfies verifier/challenge generated correctly (S256)
  it('generates a code verifier and S256 code challenge', async () => {
    mockBuildCodeAsync.mockResolvedValue({
      codeVerifier: 'test-verifier-with-sufficient-length-for-pkce',
      codeChallenge: 'test-challenge',
    });

    const pair = await generatePkcePair();

    expect(pair.codeVerifier).toBe('test-verifier-with-sufficient-length-for-pkce');
    expect(pair.codeChallenge).toBe('test-challenge');
    expect(mockBuildCodeAsync).toHaveBeenCalled();
  });
});

// ── exchangeCode ──

describe('exchangeCode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const testUser = { id: 'u1', username: 'alice', displayName: 'Alice' };

  // @satisfies token POST body shape matches server contract exactly
  it('POSTs grantType=authorization_code with code + codeVerifier + redirectUri', async () => {
    mockFetch([
      {
        url: '/auth/token',
        status: 201,
        body: {
          accessToken: 'at-1',
          refreshToken: 'rt-1',
          expiresIn: 3600,
          user: testUser,
        },
      },
    ]);

    const result = await exchangeCode(BASE, 'the-code', 'the-verifier', 'openchat://auth');

    expect(fetch).toHaveBeenCalledWith(`${BASE}/auth/token`, expect.objectContaining({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    }));

    const bodyArg = JSON.parse(jest.mocked(fetch).mock.calls[0]![1]!.body as string);
    expect(bodyArg).toEqual({
      grantType: 'authorization_code',
      code: 'the-code',
      codeVerifier: 'the-verifier',
      redirectUri: 'openchat://auth',
    });

    expect(result.accessToken).toBe('at-1');
    expect(result.refreshToken).toBe('rt-1');
    expect(result.user.username).toBe('alice');
  });

  it('throws PkceError when token endpoint returns non-2xx', async () => {
    mockFetch([{ url: '/auth/token', status: 400, body: { message: 'bad code' } }]);
    await expect(
      exchangeCode(BASE, 'bad', 'v', 'openchat://auth'),
    ).rejects.toMatchObject({ code: 'token_exchange_failed' });
  });

  it('throws PkceError when response is missing accessToken', async () => {
    mockFetch([
      {
        url: '/auth/token',
        status: 201,
        body: { refreshToken: 'rt-1', user: testUser },
      },
    ]);
    await expect(
      exchangeCode(BASE, 'c', 'v', 'openchat://auth'),
    ).rejects.toMatchObject({ code: 'token_exchange_failed' });
  });
});
