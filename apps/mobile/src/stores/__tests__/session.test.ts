import { configureSession, useSession } from '../session';
import { createMemoryVault } from '../../lib/tokenVault';
import { resolveConfig } from '../../lib/config';

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
});
