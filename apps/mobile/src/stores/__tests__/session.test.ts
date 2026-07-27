import { configureSession, useSession } from '../session';
import { createMemoryVault } from '../../lib/tokenVault';
import { resolveConfig } from '../../lib/config';

// Mock PKCE module so loginWithPkce can be tested without native modules
const mockFetchedMetadata = {
  issuer: 'https://auth.example.com',
  clientId: 'abc123',
  nativeRedirectUri: 'openchat://auth',
  scopes: ['openid', 'profile', 'email'],
};
jest.mock('../../lib/pkce', () => ({
  fetchOidcMetadata: jest.fn().mockResolvedValue({
    issuer: 'https://auth.example.com',
    clientId: 'abc123',
    nativeRedirectUri: 'openchat://auth',
    scopes: ['openid', 'profile', 'email'],
  }),
  generatePkcePair: jest.fn().mockResolvedValue({
    codeVerifier: 'test-verifier',
    codeChallenge: 'test-challenge',
  }),
  authorizeViaBrowser: jest.fn().mockResolvedValue({
    accessToken: 'pkce-at',
    refreshToken: 'pkce-rt',
    expiresIn: 3600,
    user: { id: 'u2', username: 'bob', displayName: 'Bob' },
  }),
}));

/**
 * FR-AUTH-003's unit half: the vault→session restore path (the on-device kill/
 * relaunch proof is the p1-session-restore Maestro flow).
 */

function mockFetchScript(script: (url: string) => { status: number; body?: unknown }): void {
  global.fetch = jest.fn(async (url: string) => {
    const r = script(String(url));
    return { status: r.status, text: async () => JSON.stringify(r.body ?? {}) };
  }) as unknown as typeof fetch;
}

const cfg = resolveConfig({ apiBaseUrl: 'http://api.test/api', wsUrl: 'ws://api.test/ws' });

describe('session restore', () => {
  beforeEach(() => {
    useSession.setState({ status: 'restoring', user: null, tokens: null });
  });

  // @satisfies FR-AUTH-003
  it('restores a signed-in session from stored tokens without any login UI', async () => {
    const vault = createMemoryVault();
    await vault.save({ accessToken: 'at', refreshToken: 'rt' });
    configureSession({ vault, config: cfg });
    mockFetchScript((url) =>
      url.endsWith('/auth/me')
        ? { status: 200, body: { id: 'u1', username: 'alice' } }
        : { status: 404 },
    );

    await useSession.getState().restore();
    expect(useSession.getState().status).toBe('signedIn');
    expect(useSession.getState().user?.username).toBe('alice');
  });

  it('lands on signedOut when the vault is empty', async () => {
    configureSession({ vault: createMemoryVault(), config: cfg });
    await useSession.getState().restore();
    expect(useSession.getState().status).toBe('signedOut');
  });

  it('clears the vault and signs out when stored tokens no longer authenticate', async () => {
    const vault = createMemoryVault();
    await vault.save({ accessToken: 'dead', refreshToken: 'dead' });
    configureSession({ vault, config: cfg });
    mockFetchScript(() => ({ status: 401, body: { message: 'expired' } }));

    await useSession.getState().restore();
    expect(useSession.getState().status).toBe('signedOut');
    expect(await vault.load()).toBeNull();
  });

  // @satisfies FR-AUTH-004
  it('logout clears vault and state and posts the refresh token for revocation', async () => {
    const vault = createMemoryVault();
    await vault.save({ accessToken: 'at', refreshToken: 'rt' });
    configureSession({ vault, config: cfg });
    useSession.setState({ status: 'signedIn', tokens: { accessToken: 'at', refreshToken: 'rt' } });

    let revoked: unknown = null;
    mockFetchScript(() => ({ status: 201, body: {} }));
    const fetchMock = global.fetch as jest.Mock;

    await useSession.getState().logout();
    revoked = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(revoked).toEqual({ refreshToken: 'rt' });
    expect(useSession.getState().status).toBe('signedOut');
    expect(await vault.load()).toBeNull();
  });

  // @satisfies FR-AUTH-001: PKCE login stores tokens in vault and sets signedIn
  it('loginWithPkce stores tokens in the vault and transitions to signedIn', async () => {
    const vault = createMemoryVault();
    configureSession({ vault, config: cfg });

    await useSession.getState().loginWithPkce();
    expect(useSession.getState().status).toBe('signedIn');
    expect(useSession.getState().user?.username).toBe('bob');
    expect(useSession.getState().tokens).toEqual({ accessToken: 'pkce-at', refreshToken: 'pkce-rt' });

    // tokens are persisted in the vault for session restore
    const stored = await vault.load();
    expect(stored).toEqual({ accessToken: 'pkce-at', refreshToken: 'pkce-rt' });
  });

  // @satisfies DEV-LOGIN STILL WORKS — backward-compat guard for E2E suite
  it('devLogin still works and does not trigger PKCE', async () => {
    const vault = createMemoryVault();
    configureSession({ vault, config: cfg });
    mockFetchScript((url) =>
      url.endsWith('/auth/dev-login')
        ? { status: 201, body: { id: 'u1', username: 'alice', accessToken: 'dev-at', refreshToken: 'dev-rt' } }
        : { status: 404 },
    );

    await useSession.getState().devLogin('alice');
    expect(useSession.getState().status).toBe('signedIn');
    expect(useSession.getState().user?.username).toBe('alice');

    const stored = await vault.load();
    expect(stored).toEqual({ accessToken: 'dev-at', refreshToken: 'dev-rt' });
  });
});
