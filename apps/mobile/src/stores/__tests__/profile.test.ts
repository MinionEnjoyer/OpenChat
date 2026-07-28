import { configureSession, useSession } from '../session';
import { createMemoryVault } from '../../lib/tokenVault';
import { resolveConfig } from '../../lib/config';
import type { User } from '../../api/schema';

const cfg = resolveConfig({ apiBaseUrl: 'http://api.test/api', wsUrl: 'ws://api.test/ws' });
const me = { id: 'u1', username: 'alice', displayName: 'Alice' } as User;

describe('profile edit (optimistic with rollback)', () => {
  beforeEach(() => {
    configureSession({ vault: createMemoryVault(), config: cfg });
    useSession.setState({
      status: 'signedIn',
      user: me,
      tokens: { accessToken: 'at', refreshToken: 'rt' },
    });
  });

  // @satisfies FR-AUTH-006
  it('applies the edit optimistically and keeps the server copy on success', async () => {
    global.fetch = jest.fn(async () => ({
      status: 200,
      text: async () => JSON.stringify({ ...me, displayName: 'Alice Prime' }),
    })) as unknown as typeof fetch;

    await useSession.getState().updateProfile({ displayName: 'Alice Prime' });
    expect(useSession.getState().user?.displayName).toBe('Alice Prime');
  });

  // @satisfies FR-APP-006
  it('rolls back on failure and rethrows so the caller can toast with retry', async () => {
    global.fetch = jest.fn(async () => ({
      status: 500,
      text: async () => JSON.stringify({ message: 'boom' }),
    })) as unknown as typeof fetch;

    await expect(
      useSession.getState().updateProfile({ displayName: 'Nope' }),
    ).rejects.toMatchObject({ status: 500, retriable: true });
    // Rolled back — no silent half-applied state.
    expect(useSession.getState().user?.displayName).toBe('Alice');
  });
});
