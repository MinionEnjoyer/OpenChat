/**
 * Invalidation tests for useOpenDm (dms/hooks.ts).
 *
 * Exercises the REAL hook. Mocking only the network boundary (api.request).
 *
 * READ side (the oracle):
 *   DM list: ShellScreen.tsx:148 → useQuery({ queryKey: ['dms'], ... })
 *   DM list: DmsList.tsx:38     → useQuery({ queryKey: ['dms'], ... })
 */
import { useOpenDm } from '../hooks';
import { api } from '../../../stores/session';
import { runInvalidationTest } from '../../../__tests__/mutationInvalidationHelper';

jest.mock('../../../stores/session', () => ({
  api: { request: jest.fn() },
  useSession: { getState: jest.fn().mockReturnValue({ status: 'signedIn', user: null }) },
}));

const READ_KEY = ['dms'] as const; // from ShellScreen.tsx:148, DmsList.tsx:38

describe('dm mutation invalidation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('OPEN DM — must invalidate ["dms"] after POST /dms', async () => {
    (api.request as jest.Mock).mockResolvedValue({
      id: 'dm-ch-1', type: 'DM', userIds: ['user-a', 'user-b'],
    });

    const result = await runInvalidationTest(
      'useOpenDm',
      () => useOpenDm(),
      'user-b',
      READ_KEY,
    );

    expect(result.invalidated).toBe(true);
  });
});
